import math
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, TrajectoryGenerationError
from app.models.agl import AGL
from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.enums import CameraAction, InspectionMethod, WaypointType
from app.models.flight_plan import ConstraintRule, FlightPlan
from app.models.inspection import Inspection, InspectionTemplate
from app.models.mission import Mission
from app.schemas.geometry import parse_ewkb
from app.services.flight_plan_service import persist_flight_plan
from app.services.safety_validator import (
    check_battery,
    segment_runway_crossing_length,
    validate_inspection_pass,
)
from app.services.trajectory_computation import (
    check_sensor_fov,
    check_speed_framerate,
    compute_measurement_trajectory,
    compute_optimal_speed,
    determine_end_position,
    determine_start_position,
    get_glide_slope_angle,
    get_lha_positions,
    get_lha_setting_angles,
    get_runway_heading,
    resolve_density,
    resolve_speed,
    resolve_with_defaults,
)
from app.services.trajectory_pathfinding import (
    compute_transit_path,
    has_line_of_sight,
    resolve_inspection_collisions,
)
from app.services.trajectory_types import (
    DEFAULT_RESERVE_MARGIN,
    DEFAULT_SPEED,
    LANDING_SAFE_ALTITUDE,
    MIN_ARC_RADIUS,
    MIN_SPEED_FLOOR,
    TAKEOFF_SAFE_ALTITUDE,
    InspectionPass,
    MissionData,
    Point3D,
    WaypointData,
)
from app.utils.geo import bearing_between, distance_between, total_path_distance


def _load_mission_data(db: Session, mission_id: UUID) -> MissionData:
    """Load all entities needed for trajectory generation in a single query phase."""
    mission = (
        db.query(Mission)
        .options(
            joinedload(Mission.drone_profile),
            joinedload(Mission.inspections)
            .joinedload(Inspection.template)
            .joinedload(InspectionTemplate.default_config),
            joinedload(Mission.inspections).joinedload(Inspection.config),
            joinedload(Mission.inspections)
            .joinedload(Inspection.template)
            .joinedload(InspectionTemplate.targets)
            .joinedload(AGL.lhas),
            joinedload(Mission.flight_plan),
        )
        .filter(Mission.id == mission_id)
        .first()
    )
    if not mission:
        raise NotFoundError("mission not found")
    if not mission.inspections:
        raise TrajectoryGenerationError("mission has no inspections")

    airport = db.query(Airport).filter(Airport.id == mission.airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    obstacles = db.query(Obstacle).filter(Obstacle.airport_id == airport.id).all()
    safety_zones = (
        db.query(SafetyZone)
        .filter(SafetyZone.airport_id == airport.id, SafetyZone.is_active == True)  # noqa: E712
        .all()
    )
    surfaces = db.query(AirfieldSurface).filter(AirfieldSurface.airport_id == airport.id).all()

    # constraint rules live on the flight plan which gets deleted before regeneration;
    # drone limits are checked directly in validate_inspection_pass
    constraints: list[ConstraintRule] = []

    return MissionData(
        mission=mission,
        airport=airport,
        drone=mission.drone_profile,
        obstacles=obstacles,
        safety_zones=safety_zones,
        surfaces=surfaces,
        constraints=constraints,
        default_speed=mission.default_speed or DEFAULT_SPEED,
    )


def _apply_camera_actions(waypoints: list[WaypointData]):
    """Set lead-in/lead-out waypoints to NONE camera action, inner to PHOTO_CAPTURE."""
    if len(waypoints) >= 2:
        waypoints[0].camera_action = CameraAction.NONE
        waypoints[-1].camera_action = CameraAction.NONE


def generate_trajectory(db: Session, mission_id: UUID) -> tuple[FlightPlan, list[str]]:
    """Five-phase trajectory generation pipeline.

    Phase 1: load all data
    Phase 2: config resolution and pre-checks per inspection
    Phase 3: compute waypoints, validate, and reroute
    Phase 4: post-inspection processing
    Phase 5: final assembly with A* transit
    """

    # phase 1 - load all data
    data = _load_mission_data(db, mission_id)
    mission = data.mission
    drone = data.drone
    default_speed = data.default_speed

    if mission.flight_plan:
        db.delete(mission.flight_plan)
        db.flush()

    warnings: list[str] = []
    inspection_passes: list[InspectionPass] = []
    cumulative_distance = 0.0
    cumulative_duration = 0.0

    sorted_inspections = sorted(mission.inspections, key=lambda i: i.sequence_order)

    for inspection in sorted_inspections:
        template = inspection.template

        # phase 2 - resolve config and pre-checks
        config = resolve_with_defaults(inspection, template)

        lha_positions = get_lha_positions(template)
        if not lha_positions:
            warnings.append(f"{template.name} #{inspection.sequence_order}: no LHA positions")
            continue

        center = Point3D.center(lha_positions)
        glide_slope = get_glide_slope_angle(template)
        rwy_heading = get_runway_heading(template, data.surfaces)
        setting_angles = get_lha_setting_angles(template)

        # compute optimal density if not overridden
        density, density_warning = resolve_density(inspection.method, setting_angles, config)
        if density_warning:
            if inspection.config:
                inspection.config.measurement_density = density
            warnings.append(f"{template.name} #{inspection.sequence_order}: {density_warning}")

        # compute optimal speed from path geometry and camera frame rate
        start_pos = determine_start_position(
            center, config, inspection.method, rwy_heading, glide_slope
        )
        end_pos = determine_end_position(
            center, config, inspection.method, rwy_heading, glide_slope
        )
        path_dist = distance_between(start_pos.lon, start_pos.lat, end_pos.lon, end_pos.lat)

        speed, speed_warning = resolve_speed(
            config, path_dist, config.measurement_density, drone, default_speed
        )
        if speed_warning:
            # save computed speed back to config so the operator can see it
            if inspection.config:
                inspection.config.speed_override = speed
            warnings.append(f"{template.name} #{inspection.sequence_order}: {speed_warning}")

        if drone:
            optimal_speed = compute_optimal_speed(path_dist, config.measurement_density, drone)
            warning = check_speed_framerate(speed, drone, optimal_speed)
            if warning:
                warnings.append(warning)

        if drone:
            warning = check_sensor_fov(drone, lha_positions, MIN_ARC_RADIUS)
            if warning:
                warnings.append(warning)

        # phase 3 - compute waypoints
        try:
            pass_wps = compute_measurement_trajectory(
                inspection, config, center, rwy_heading, glide_slope, speed, setting_angles
            )
        except ValueError as e:
            raise TrajectoryGenerationError(str(e))

        # phase 3 - validate and reroute
        violations = validate_inspection_pass(
            db, pass_wps, drone, data.constraints, data.obstacles, data.safety_zones, data.surfaces
        )

        obstacle_violations = [
            v for v in violations if not v.is_warning and "obstacle" in (v.message or "").lower()
        ]

        if obstacle_violations:
            pass_wps = resolve_inspection_collisions(
                db, pass_wps, data.obstacles, data.safety_zones, center
            )

            # re-validate after rerouting
            violations = validate_inspection_pass(
                db,
                pass_wps,
                drone,
                data.constraints,
                data.obstacles,
                data.safety_zones,
                data.surfaces,
            )

        hard = [v for v in violations if not v.is_warning]
        if hard:
            raise TrajectoryGenerationError(
                "hard constraint violation",
                violations=[{"message": v.message} for v in hard],
            )

        # group soft warnings by message, show affected waypoint range
        label = f"{template.name} #{inspection.sequence_order}"
        soft_groups: dict[str, list[int]] = {}
        for v in violations:
            if not v.is_warning:
                continue
            indices = soft_groups.setdefault(v.message, [])
            if v.waypoint_index is not None:
                indices.append(v.waypoint_index + 1)

        for msg, indices in soft_groups.items():
            if indices:
                if len(indices) <= 3:
                    wp_str = ", ".join(str(i) for i in sorted(indices))
                else:
                    wp_str = f"{min(indices)}-{max(indices)}"
                full = f"{label} (wp {wp_str}): {msg}"
            else:
                full = f"{label}: {msg}"
            if full not in warnings:
                warnings.append(full)

        # phase 4 - post-inspection processing
        _apply_camera_actions(pass_wps)

        # check camera line-of-sight to PAPI for each measurement waypoint
        obstructed_wps = []
        for wp_idx, wp in enumerate(pass_wps):
            if wp.waypoint_type not in (WaypointType.MEASUREMENT, WaypointType.HOVER):
                continue
            wp_pt = Point3D(lon=wp.lon, lat=wp.lat, alt=wp.alt)
            if not has_line_of_sight(db, wp_pt, center, data.obstacles, data.safety_zones):
                obstructed_wps.append(wp_idx + 1)

        if obstructed_wps:
            label = f"{template.name} #{inspection.sequence_order}"
            if len(obstructed_wps) <= 3:
                wp_str = ", ".join(str(i) for i in obstructed_wps)
            else:
                wp_str = f"{min(obstructed_wps)}-{max(obstructed_wps)}"
            warnings.append(f"{label} (wp {wp_str}): camera view to PAPI obstructed")

        points = [(wp.lon, wp.lat, wp.alt) for wp in pass_wps]
        seg_dist = total_path_distance(points)
        # note: uses per-pass speed for battery estimate; final duration uses per-waypoint speed
        seg_dur = seg_dist / max(speed, MIN_SPEED_FLOOR)

        for wp in pass_wps:
            if wp.hover_duration:
                seg_dur += wp.hover_duration

        cumulative_distance += seg_dist
        cumulative_duration += seg_dur

        if drone:
            bw = check_battery(cumulative_duration, drone, DEFAULT_RESERVE_MARGIN)
            if bw:
                warnings.append(bw.message)

        # for vertical profiles, add descent waypoint back to start altitude
        # so transit doesn't start from the top of the vertical sweep
        if (
            inspection.method == InspectionMethod.VERTICAL_PROFILE
            and len(pass_wps) >= 2
            and abs(pass_wps[0].lon - pass_wps[-1].lon) < 0.0001
            and abs(pass_wps[0].lat - pass_wps[-1].lat) < 0.0001
        ):
            pass_wps.append(
                WaypointData(
                    lon=pass_wps[0].lon,
                    lat=pass_wps[0].lat,
                    alt=pass_wps[0].alt,
                    heading=pass_wps[-1].heading,
                    speed=speed,
                    waypoint_type=WaypointType.TRANSIT,
                    camera_action=CameraAction.NONE,
                )
            )

        inspection_passes.append(InspectionPass(waypoints=pass_wps, inspection_id=inspection.id))

    if not inspection_passes:
        raise TrajectoryGenerationError("no waypoints generated")

    # phase 5 - final assembly with A* transit
    all_waypoints: list[WaypointData] = []

    # takeoff + climb to safe altitude before transit
    if mission.takeoff_coordinate:
        tc = parse_ewkb(mission.takeoff_coordinate.data)["coordinates"]
        first_wp = inspection_passes[0].waypoints[0]
        all_waypoints.append(
            WaypointData(
                lon=tc[0],
                lat=tc[1],
                alt=tc[2],
                heading=bearing_between(tc[0], tc[1], first_wp.lon, first_wp.lat),
                speed=default_speed,
                waypoint_type=WaypointType.TAKEOFF,
                camera_action=CameraAction.NONE,
            )
        )

        # TODO: this should be configurable in mission config
        # vertical climb to safe altitude before starting transit
        safe_alt = tc[2] + TAKEOFF_SAFE_ALTITUDE
        all_waypoints.append(
            WaypointData(
                lon=tc[0],
                lat=tc[1],
                alt=safe_alt,
                heading=bearing_between(tc[0], tc[1], first_wp.lon, first_wp.lat),
                speed=default_speed,
                waypoint_type=WaypointType.TRANSIT,
                camera_action=CameraAction.NONE,
            )
        )

    for i, ipass in enumerate(inspection_passes):
        # A* transit from previous endpoint to this pass start
        if all_waypoints:
            prev = all_waypoints[-1]
            start = ipass.waypoints[0]
            from_pt = Point3D(lon=prev.lon, lat=prev.lat, alt=prev.alt)
            to_pt = Point3D(lon=start.lon, lat=start.lat, alt=start.alt)

            transit_wps = compute_transit_path(
                db,
                from_pt,
                to_pt,
                data.obstacles,
                data.safety_zones,
                default_speed,
                data.surfaces,
            )
            all_waypoints.extend(transit_wps)

        all_waypoints.extend(ipass.waypoints)

    # landing: transit to safe altitude above landing spot, then descend
    if mission.landing_coordinate:
        lc = parse_ewkb(mission.landing_coordinate.data)["coordinates"]
        safe_alt = lc[2] + LANDING_SAFE_ALTITUDE
        last = all_waypoints[-1]
        from_pt = Point3D(lon=last.lon, lat=last.lat, alt=last.alt)
        above_landing = Point3D(lon=lc[0], lat=lc[1], alt=safe_alt)

        # transit to point above landing spot
        landing_transit = compute_transit_path(
            db,
            from_pt,
            above_landing,
            data.obstacles,
            data.safety_zones,
            default_speed,
            data.surfaces,
        )
        all_waypoints.extend(landing_transit)

        # vertical descent to landing
        all_waypoints.append(
            WaypointData(
                lon=lc[0],
                lat=lc[1],
                alt=lc[2],
                heading=all_waypoints[-1].heading,
                speed=default_speed,
                waypoint_type=WaypointType.LANDING,
                camera_action=CameraAction.NONE,
            )
        )

    # check for runway/taxiway crossings and add warnings
    for j in range(1, len(all_waypoints)):
        prev_wp = all_waypoints[j - 1]
        cur_wp = all_waypoints[j]
        for surface in data.surfaces:
            crossing = segment_runway_crossing_length(
                db,
                prev_wp.lon,
                prev_wp.lat,
                cur_wp.lon,
                cur_wp.lat,
                surface,
            )
            if crossing > 0:
                wp_type = cur_wp.waypoint_type
                msg = (
                    f"wp {j}-{j + 1} ({wp_type}): crosses "
                    f"{surface.surface_type} {surface.identifier} "
                    f"({crossing:.0f}m)"
                )
                if msg not in warnings:
                    warnings.append(msg)

    # final validation of assembled path
    final_violations = validate_inspection_pass(
        db,
        all_waypoints,
        drone,
        data.constraints,
        data.obstacles,
        data.safety_zones,
        data.surfaces,
    )
    final_hard = [v for v in final_violations if not v.is_warning]
    if final_hard:
        raise TrajectoryGenerationError(
            "final validation failed",
            violations=[{"message": v.message} for v in final_hard],
        )

    final_groups: dict[str, list[int]] = {}
    for v in final_violations:
        if not v.is_warning:
            continue
        indices = final_groups.setdefault(v.message, [])
        if v.waypoint_index is not None:
            indices.append(v.waypoint_index + 1)

    for msg, indices in final_groups.items():
        if indices:
            if len(indices) <= 3:
                wp_str = ", ".join(str(i) for i in sorted(indices))
            else:
                wp_str = f"{min(indices)}-{max(indices)}"
            full = f"final validation (wp {wp_str}): {msg}"
        else:
            full = f"final validation: {msg}"
        if full not in warnings:
            warnings.append(full)

    # compute final totals per-segment
    total_dist = 0.0
    total_dur = 0.0
    for j in range(len(all_waypoints)):
        if j > 0:
            prev = all_waypoints[j - 1]
            cur = all_waypoints[j]
            seg = distance_between(prev.lon, prev.lat, cur.lon, cur.lat)
            altitude_diff = cur.alt - prev.alt
            d = math.sqrt(seg**2 + altitude_diff**2)
            total_dist += d
            total_dur += d / max(cur.speed, MIN_SPEED_FLOOR)

        if all_waypoints[j].hover_duration:
            total_dur += all_waypoints[j].hover_duration

    flight_plan = persist_flight_plan(db, mission, all_waypoints, warnings, total_dist, total_dur)

    return flight_plan, warnings
