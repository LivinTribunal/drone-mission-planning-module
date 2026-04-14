import math
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.exceptions import NotFoundError, TrajectoryGenerationError
from app.models.agl import AGL
from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.enums import CameraAction, InspectionMethod, MissionStatus, WaypointType
from app.models.flight_plan import ConstraintRule, FlightPlan
from app.models.inspection import Inspection, InspectionTemplate
from app.models.mission import Mission
from app.models.value_objects import Coordinate
from app.schemas.geometry import parse_ewkb
from app.services.elevation_provider import create_elevation_provider
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
    determine_end_position,
    determine_start_position,
    find_lha_by_id,
    find_lha_in_surfaces,
    get_glide_slope_angle,
    get_lha_positions,
    get_lha_setting_angles,
    get_ordered_lha_positions,
    get_runway_centerline_midpoint,
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
    DEFAULT_FLY_OVER_SPEED,
    DEFAULT_PARALLEL_SPEED,
    DEFAULT_RESERVE_MARGIN,
    DEFAULT_SPEED,
    MIN_ARC_RADIUS,
    MIN_SPEED_FLOOR,
    TRANSIT_AGL,
    VERTICAL_POSITION_TOLERANCE_DEG,
    InspectionPass,
    MissionData,
    Point3D,
    WaypointData,
)
from app.utils.geo import bearing_between, distance_between, total_path_distance


def _parse_coordinate(ewkb_data, label: str) -> list[float]:
    """parse and validate a 3D coordinate from EWKB geometry data."""
    try:
        parsed = parse_ewkb(ewkb_data)
        if parsed is None:
            raise TrajectoryGenerationError(f"{label} coordinate geometry is empty")
        coords = parsed.get("coordinates")
    except TrajectoryGenerationError:
        raise
    except Exception as e:
        raise TrajectoryGenerationError(f"failed to parse {label} coordinate geometry") from e
    if not coords or len(coords) < 3:
        raise TrajectoryGenerationError(f"{label} coordinate must be a valid 3D point")
    try:
        Coordinate(lat=coords[1], lon=coords[0], alt=coords[2])
    except ValueError as e:
        raise TrajectoryGenerationError(f"invalid {label} coordinate: {e}")

    return coords


def _load_mission_data(db: Session, mission_id: UUID) -> MissionData:
    """load all entities needed for trajectory generation in a single query phase.

    constraints are intentionally empty - see comment in function body.
    """
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

    # constraints intentionally empty during generation - constraint rules are
    # per-flight-plan children that get cascade-deleted with the old plan.
    # drone limits and spatial checks run directly in validate_inspection_pass.
    # operator must re-attach constraints after regeneration if needed
    constraints: list[ConstraintRule] = []

    provider = create_elevation_provider(airport)

    return MissionData(
        mission=mission,
        airport=airport,
        drone=mission.drone_profile,
        obstacles=obstacles,
        safety_zones=safety_zones,
        surfaces=surfaces,
        constraints=constraints,
        default_speed=mission.default_speed or DEFAULT_SPEED,
        elevation_provider=provider,
    )


def _format_soft_warnings(
    violations: list,
    label: str,
    warnings: list[tuple[str, list[str]]],
    wp_offset: int = 0,
) -> None:
    """group soft violations by message and append formatted warnings.

    wp_offset is added to each waypoint_index to convert pass-local indices
    to global all_waypoints indices for later UUID resolution.
    """
    groups: dict[str, list[int]] = {}
    for v in violations:
        if not v.is_warning:
            continue

        indices = groups.setdefault(v.message, [])
        if v.waypoint_index is not None:
            indices.append(v.waypoint_index + 1)

    seen_msgs = {msg for msg, _ in warnings}
    for msg, indices in groups.items():
        if indices:
            if len(indices) <= 3:
                wp_str = ", ".join(str(i) for i in sorted(indices))
            else:
                wp_str = f"{min(indices)}-{max(indices)}"
            full = f"{label} (wp {wp_str}): {msg}"
        else:
            full = f"{label}: {msg}"

        if full not in seen_msgs:
            # build idx: references for waypoint id resolution
            wp_ids = [f"idx:{(i - 1) + wp_offset}" for i in indices]
            warnings.append((full, wp_ids))


def _apply_camera_actions(waypoints: list[WaypointData]):
    """set lead-in and lead-out waypoints to NONE camera action.

    preserves RECORDING_START/RECORDING_STOP on video capture hover waypoints.
    """
    if len(waypoints) >= 2:
        if waypoints[0].camera_action not in (
            CameraAction.RECORDING_START,
            CameraAction.RECORDING_STOP,
        ):
            waypoints[0].camera_action = CameraAction.NONE
        if waypoints[-1].camera_action not in (
            CameraAction.RECORDING_START,
            CameraAction.RECORDING_STOP,
        ):
            waypoints[-1].camera_action = CameraAction.NONE


def generate_trajectory(
    db: Session, mission_id: UUID
) -> tuple[FlightPlan, list[tuple[str, list[str]]]]:
    """five-phase trajectory generation pipeline.

    phase 1: load all data
    phase 2: config resolution and pre-checks per inspection
    phase 3: compute waypoints, validate, and reroute
    phase 4: post-inspection processing
    phase 5: final assembly with A* transit
    """

    # phase 1 - load all data
    data = _load_mission_data(db, mission_id)
    provider = data.elevation_provider

    try:
        return _generate_trajectory_inner(db, data)
    finally:
        if hasattr(provider, "close"):
            provider.close()


def _generate_trajectory_inner(
    db: Session, data: MissionData
) -> tuple[FlightPlan, list[tuple[str, list[str]]]]:
    """run phases 2-5 of trajectory generation; outer function handles resource cleanup."""
    mission = data.mission
    drone = data.drone
    default_speed = data.default_speed

    # pre-check: takeoff and landing coordinates are required
    if not mission.takeoff_coordinate:
        raise TrajectoryGenerationError(
            "takeoff coordinates must be set before generating a trajectory"
        )
    if not mission.landing_coordinate:
        raise TrajectoryGenerationError(
            "landing coordinates must be set before generating a trajectory"
        )

    # delete existing flight plan before invalidation - db concern stays in service.
    # must happen before invalidate_trajectory() per its contract.
    existing_fp = mission.flight_plan
    had_constraints = False
    if existing_fp:
        had_constraints = bool(existing_fp.constraints)
        db.delete(existing_fp)
        db.flush()

    # auto-regress VALIDATED so regeneration works without manual step
    if mission.status == MissionStatus.VALIDATED:
        mission.invalidate_trajectory()

    # only DRAFT or PLANNED can generate - terminal states are blocked
    if mission.status not in (MissionStatus.DRAFT, MissionStatus.PLANNED):
        raise TrajectoryGenerationError(
            f"cannot generate trajectory for mission in {mission.status} status"
        )

    warnings: list[tuple[str, list[str]]] = []
    suggestions: list[tuple[str, list[str]]] = []
    non_aborting_violations: list[tuple[str, list[str]]] = []
    if had_constraints:
        warnings.append(("constraints were reset - re-attach after generation", []))

    inspection_passes: list[InspectionPass] = []
    # deferred per-pass data for formatting after phase 5 assembly
    deferred_pass_data: list[tuple[str, list, list[int]]] = []
    cumulative_distance = 0.0
    cumulative_duration = 0.0

    # resolve configurable transit altitude above ground level
    transit_agl = data.mission.transit_agl if data.mission.transit_agl is not None else TRANSIT_AGL
    if data.mission.transit_agl is None:
        suggestions.append(
            (
                f"no transit AGL set - using default ({TRANSIT_AGL:.1f} m); "
                "consider raising transit_agl to reduce soft AGL warnings",
                [],
            )
        )

    # resolve mission-level default buffer for transit A*
    mission_buffer_override = data.mission.default_buffer_distance

    sorted_inspections = sorted(mission.inspections, key=lambda i: i.sequence_order)

    for inspection in sorted_inspections:
        template = inspection.template

        # phase 2 - resolve config and pre-checks
        config = resolve_with_defaults(inspection, template)

        # inject mission-level default capture mode when neither inspection nor template set it
        insp_cm = getattr(inspection.config, "capture_mode", None) if inspection.config else None
        tmpl_cm = (
            getattr(template.default_config, "capture_mode", None)
            if template.default_config
            else None
        )
        if insp_cm is None and tmpl_cm is None and mission.default_capture_mode:
            config.capture_mode = str(mission.default_capture_mode)

        # inject mission-level default buffer distance when neither inspection nor template set it
        insp_bd = getattr(inspection.config, "buffer_distance", None) if inspection.config else None
        tmpl_bd = (
            getattr(template.default_config, "buffer_distance", None)
            if template.default_config
            else None
        )
        if insp_bd is None and tmpl_bd is None and mission.default_buffer_distance is not None:
            config.buffer_distance = mission.default_buffer_distance

        # generate suggestions for fields using template defaults
        label = f"{template.name} #{inspection.sequence_order}"
        if not inspection.config or inspection.config.speed_override is None:
            default_spd = (
                template.default_config.speed_override
                if template.default_config and template.default_config.speed_override
                else default_speed
            )
            suggestions.append(
                (
                    f"{label}: no speed override - using default ({default_spd:.1f} m/s)",
                    [],
                )
            )
        if not inspection.config or inspection.config.measurement_density is None:
            default_density = (
                template.default_config.measurement_density
                if template.default_config and template.default_config.measurement_density
                else None
            )
            if default_density:
                suggestions.append(
                    (
                        f"{label}: no density override - using default ({default_density} pts)",
                        [],
                    )
                )

        lha_ids = inspection.lha_ids
        lha_positions = get_lha_positions(template, lha_ids)
        if not lha_positions:
            warnings.append(
                (
                    f"{template.name} #{inspection.sequence_order}: no LHA positions",
                    [],
                )
            )
            continue

        center = Point3D.center(lha_positions)

        glide_slope = get_glide_slope_angle(template)
        rwy_heading = get_runway_heading(template, data.surfaces)
        setting_angles = get_lha_setting_angles(template, lha_ids)

        # ordered LHA positions are used by fly-over and parallel-side-sweep
        ordered_lhas = get_ordered_lha_positions(template, lha_ids)

        # parallel-side-sweep needs a point on the runway centerline to orient
        # the perpendicular offset. LHA row centroid is not a substitute.
        runway_center: Point3D | None = None
        if inspection.method == InspectionMethod.PARALLEL_SIDE_SWEEP:
            runway_center = get_runway_centerline_midpoint(template, data.surfaces)
            if runway_center is None:
                raise TrajectoryGenerationError(
                    f"{template.name} #{inspection.sequence_order}: "
                    "parallel-side-sweep requires a runway surface with a centerline "
                    "for its target AGL"
                )

        # hover-point-lock needs a single operator-selected LHA
        target_lha_pos: Point3D | None = None
        target_agl_type: str | None = None
        is_new_method = inspection.method in (
            InspectionMethod.FLY_OVER,
            InspectionMethod.PARALLEL_SIDE_SWEEP,
            InspectionMethod.HOVER_POINT_LOCK,
        )
        if inspection.method == InspectionMethod.HOVER_POINT_LOCK:
            selected_id = config.selected_lha_id
            if selected_id is None:
                raise TrajectoryGenerationError(
                    f"{template.name} #{inspection.sequence_order}: "
                    "hover-point-lock requires a selected LHA"
                )
            # hover-point-lock is AGL-agnostic: search across all airport AGLs
            # instead of the template's target list.
            match = find_lha_by_id(template, selected_id)
            if match is None:
                match = find_lha_in_surfaces(data.surfaces, selected_id)
            if match is None:
                raise TrajectoryGenerationError(
                    f"{template.name} #{inspection.sequence_order}: "
                    f"selected LHA {selected_id} not found in airport"
                )
            target_lha_pos, target_agl = match
            target_agl_type = target_agl.agl_type
            # hover can reference a "RUNWAY" bearing - resolve heading from the
            # surface hosting the selected LHA's AGL when the template has no
            # target AGLs of its own (AGL-agnostic hover templates).
            for surface in data.surfaces:
                if surface.id == target_agl.surface_id and surface.heading:
                    rwy_heading = surface.heading
                    break

        # compute optimal density if not overridden
        density, density_warning = resolve_density(inspection.method, setting_angles, config)
        if density_warning:
            config.measurement_density = density
            suggestions.append(
                (
                    f"{template.name} #{inspection.sequence_order}: {density_warning}",
                    [],
                )
            )

        # compute path distance for speed/framerate check
        if inspection.method == InspectionMethod.HOVER_POINT_LOCK:
            # hover has zero travel distance by definition
            path_dist = 0.0
        elif is_new_method:
            path_dist = 0.0
            for k in range(1, len(ordered_lhas)):
                path_dist += distance_between(
                    ordered_lhas[k - 1].lon,
                    ordered_lhas[k - 1].lat,
                    ordered_lhas[k].lon,
                    ordered_lhas[k].lat,
                )
        else:
            start_pos = determine_start_position(
                center, config, inspection.method, rwy_heading, glide_slope
            )
            end_pos = determine_end_position(
                center, config, inspection.method, rwy_heading, glide_slope
            )
            path_dist = distance_between(start_pos.lon, start_pos.lat, end_pos.lon, end_pos.lat)

        # method-specific default speed overrides mission default for new methods
        if inspection.method == InspectionMethod.FLY_OVER:
            method_default_speed = DEFAULT_FLY_OVER_SPEED
        elif inspection.method == InspectionMethod.PARALLEL_SIDE_SWEEP:
            method_default_speed = DEFAULT_PARALLEL_SPEED
        else:
            method_default_speed = default_speed

        # fly-over and parallel-side-sweep generate exactly len(ordered_lhas)
        # waypoints (one per LHA), not config.measurement_density. passing the
        # wrong density inflates waypoint_spacing and yields over-conservative
        # speed recommendations plus spurious framerate warnings.
        if inspection.method in (
            InspectionMethod.FLY_OVER,
            InspectionMethod.PARALLEL_SIDE_SWEEP,
        ):
            density_for_speed = max(len(ordered_lhas), 2)
        else:
            density_for_speed = config.measurement_density

        speed, speed_warning, optimal_speed = resolve_speed(
            config, path_dist, density_for_speed, drone, method_default_speed
        )
        if speed_warning:
            warnings.append(
                (
                    f"{template.name} #{inspection.sequence_order}: {speed_warning}",
                    [],
                )
            )

        if drone:
            warning = check_speed_framerate(speed, drone, optimal_speed)
            if warning:
                warnings.append((warning, []))

        # FOV check only applies to methods where the drone hovers/approaches at a fixed
        # standoff radius - fly-over and parallel-side-sweep fly along the lights so
        # horizontal_distance is not a meaningful approach distance for them.
        if drone and inspection.method in (
            InspectionMethod.ANGULAR_SWEEP,
            InspectionMethod.VERTICAL_PROFILE,
        ):
            fov_distance = config.horizontal_distance or MIN_ARC_RADIUS
            approach = (rwy_heading + 180) % 360
            warning = check_sensor_fov(drone, lha_positions, fov_distance, approach)
            if warning:
                warnings.append((warning, []))

        # phase 3 - compute waypoints
        try:
            pass_wps = compute_measurement_trajectory(
                inspection,
                config,
                center,
                rwy_heading,
                glide_slope,
                speed,
                setting_angles,
                elevation_provider=data.elevation_provider,
                ordered_lha_positions=ordered_lhas,
                target_lha_position=target_lha_pos,
                target_agl_type=target_agl_type,
                runway_center=runway_center,
            )
        except ValueError as e:
            raise TrajectoryGenerationError(str(e))

        # append descent waypoints before validation so they're included in the check

        # for vertical profiles, add descent waypoint back to start altitude
        # so transit doesn't start from the top of the vertical sweep
        if (
            inspection.method == InspectionMethod.VERTICAL_PROFILE
            and len(pass_wps) >= 2
            and abs(pass_wps[0].lon - pass_wps[-1].lon) < VERTICAL_POSITION_TOLERANCE_DEG
            and abs(pass_wps[0].lat - pass_wps[-1].lat) < VERTICAL_POSITION_TOLERANCE_DEG
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

        # add descent to transit altitude after each inspection pass
        # so drone lowers to transit_agl before flying to next inspection/landing
        if pass_wps:
            last_wp = pass_wps[-1]
            if data.elevation_provider:
                ground_at_descent = data.elevation_provider.get_elevation(last_wp.lat, last_wp.lon)
                transit_alt = ground_at_descent + transit_agl
            else:
                transit_alt = center.alt + transit_agl
            if abs(last_wp.alt - transit_alt) > 0.5:
                pass_wps.append(
                    WaypointData(
                        lon=last_wp.lon,
                        lat=last_wp.lat,
                        alt=transit_alt,
                        heading=last_wp.heading,
                        speed=speed,
                        waypoint_type=WaypointType.TRANSIT,
                        camera_action=CameraAction.NONE,
                    )
                )

        # phase 3 - validate and reroute
        violations = validate_inspection_pass(
            db,
            pass_wps,
            drone,
            data.constraints,
            data.obstacles,
            data.safety_zones,
            data.surfaces,
            elevation_provider=data.elevation_provider,
            buffer_distance=config.buffer_distance,
        )

        obstacle_violations = [
            v for v in violations if not v.is_warning and v.violation_kind == "obstacle"
        ]

        if obstacle_violations:
            pass_wps = resolve_inspection_collisions(
                db,
                pass_wps,
                data.obstacles,
                data.safety_zones,
                center,
                data.surfaces,
                buffer_distance_override=config.buffer_distance,
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
                elevation_provider=data.elevation_provider,
                buffer_distance=config.buffer_distance,
            )

        hard = [v for v in violations if not v.is_warning]
        if hard:
            raise TrajectoryGenerationError(
                "hard constraint violation",
                violations=[
                    {
                        "message": v.message,
                        "violation_kind": v.violation_kind,
                        "constraint_id": v.constraint_id,
                        "waypoint_index": v.waypoint_index,
                    }
                    for v in hard
                ],
            )

        # defer soft warning formatting until after phase 5 assembly,
        # when global waypoint offsets are known
        label = f"{template.name} #{inspection.sequence_order}"

        # phase 4 - post-inspection processing
        _apply_camera_actions(pass_wps)

        # check camera line-of-sight to PAPI for each measurement waypoint
        obstructed_wps: list[int] = []
        for wp_idx, wp in enumerate(pass_wps):
            if wp.waypoint_type not in (WaypointType.MEASUREMENT, WaypointType.HOVER):
                continue
            wp_pt = Point3D(lon=wp.lon, lat=wp.lat, alt=wp.alt)
            if not has_line_of_sight(db, wp_pt, center, data.obstacles, data.safety_zones):
                obstructed_wps.append(wp_idx)

        points = [(wp.lon, wp.lat, wp.alt) for wp in pass_wps]
        seg_dist = total_path_distance(points)
        # note: uses per-pass speed for battery estimate; final duration uses per-waypoint speed
        seg_dur = seg_dist / max(speed or MIN_SPEED_FLOOR, MIN_SPEED_FLOOR)

        for wp in pass_wps:
            if wp.hover_duration is not None:
                seg_dur += wp.hover_duration

        cumulative_distance += seg_dist
        cumulative_duration += seg_dur

        deferred_pass_data.append((label, violations, obstructed_wps))
        inspection_passes.append(InspectionPass(waypoints=pass_wps, inspection_id=inspection.id))

    if not inspection_passes:
        raise TrajectoryGenerationError("no waypoints generated")

    # battery check after all inspections are computed
    if drone:
        bw = check_battery(cumulative_duration, drone, DEFAULT_RESERVE_MARGIN)
        if bw:
            warnings.append((bw.message, []))

    # phase 5 - final assembly with A* transit
    all_waypoints: list[WaypointData] = []

    # terrain helper
    provider = data.elevation_provider

    # takeoff at ground level - transit handles climb via transit_agl
    if mission.takeoff_coordinate:
        tc = _parse_coordinate(mission.takeoff_coordinate.data, "takeoff")
        if not inspection_passes[0].waypoints:
            raise TrajectoryGenerationError("first inspection produced no waypoints")
        first_wp = inspection_passes[0].waypoints[0]

        takeoff_alt = tc[2]
        if provider:
            takeoff_alt = provider.get_elevation(tc[1], tc[0])

        all_waypoints.append(
            WaypointData(
                lon=tc[0],
                lat=tc[1],
                alt=takeoff_alt,
                heading=bearing_between(tc[0], tc[1], first_wp.lon, first_wp.lat),
                speed=default_speed,
                waypoint_type=WaypointType.TAKEOFF,
                camera_action=CameraAction.NONE,
            )
        )

        # ascend to transit altitude at takeoff position before horizontal flight
        ground_at_takeoff = provider.get_elevation(tc[1], tc[0]) if provider else takeoff_alt
        climb_alt = ground_at_takeoff + transit_agl
        all_waypoints.append(
            WaypointData(
                lon=tc[0],
                lat=tc[1],
                alt=climb_alt,
                heading=bearing_between(tc[0], tc[1], first_wp.lon, first_wp.lat),
                speed=default_speed,
                waypoint_type=WaypointType.TRANSIT,
                camera_action=CameraAction.NONE,
            )
        )

    # record each pass's starting index in all_waypoints so we don't rely on
    # object identity to recover it in phase 5 postprocessing
    pass_start_indices: list[int] = []

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
                elevation_provider=provider,
                transit_agl=transit_agl,
                buffer_distance_override=mission_buffer_override,
            )
            all_waypoints.extend(transit_wps)

        pass_start_indices.append(len(all_waypoints))
        all_waypoints.extend(ipass.waypoints)

    # landing at ground level - transit handles descent via transit_agl
    if mission.landing_coordinate:
        lc = _parse_coordinate(mission.landing_coordinate.data, "landing")

        landing_alt = lc[2]
        if provider:
            landing_alt = provider.get_elevation(lc[1], lc[0])

        last = all_waypoints[-1]
        from_pt = Point3D(lon=last.lon, lat=last.lat, alt=last.alt)
        to_pt = Point3D(lon=lc[0], lat=lc[1], alt=landing_alt)

        landing_transit = compute_transit_path(
            db,
            from_pt,
            to_pt,
            data.obstacles,
            data.safety_zones,
            default_speed,
            data.surfaces,
            elevation_provider=provider,
            transit_agl=transit_agl,
            buffer_distance_override=mission_buffer_override,
        )
        all_waypoints.extend(landing_transit)

        all_waypoints.append(
            WaypointData(
                lon=lc[0],
                lat=lc[1],
                alt=landing_alt,
                heading=all_waypoints[-1].heading,
                speed=default_speed,
                waypoint_type=WaypointType.LANDING,
                camera_action=CameraAction.NONE,
            )
        )

    # build waypoint index -> inspection sequence mapping from explicit start indices
    wp_inspection_seq: dict[int, int] = {}
    for i, (pass_start, ipass) in enumerate(zip(pass_start_indices, inspection_passes)):
        for k in range(pass_start, pass_start + len(ipass.waypoints)):
            if k < len(all_waypoints):
                wp_inspection_seq[k] = i + 1

        # format deferred per-pass warnings now that global offsets are known
        if i < len(deferred_pass_data):
            d_label, d_violations, d_obstructed = deferred_pass_data[i]
            _format_soft_warnings(d_violations, d_label, warnings, wp_offset=pass_start)

            if d_obstructed:
                display_wps = [wi + 1 for wi in d_obstructed]
                if len(display_wps) <= 3:
                    wp_str = ", ".join(str(w) for w in display_wps)
                else:
                    wp_str = f"{min(display_wps)}-{max(display_wps)}"
                wp_ids = [f"idx:{wi + pass_start}" for wi in d_obstructed]
                non_aborting_violations.append(
                    (
                        f"{d_label} (wp {wp_str}): camera view to PAPI obstructed",
                        wp_ids,
                    )
                )

    # check for runway/taxiway crossings and add grouped warnings
    # measurement crossings grouped by (inspection_seq, surface) -> one warning
    # transit/other crossings kept individually
    measurement_crossings: dict[tuple[int, str], list[int]] = {}
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
                if wp_type == WaypointType.MEASUREMENT:
                    seq = wp_inspection_seq.get(j, 0)
                    key = (seq, f"{surface.surface_type} {surface.identifier}")
                    measurement_crossings.setdefault(key, []).append(j)
                else:
                    msg = (
                        f"wp {j}-{j + 1} ({wp_type}): crosses "
                        f"{surface.surface_type} {surface.identifier} "
                        f"({crossing:.0f}m)"
                    )
                    seen_msgs = {m for m, _ in non_aborting_violations}
                    if msg not in seen_msgs:
                        wp_ids = [f"idx:{j - 1}", f"idx:{j}"]
                        non_aborting_violations.append((msg, wp_ids))

    for (seq, surface_label), indices in measurement_crossings.items():
        count = len(indices)
        msg = f"inspection {seq} crosses {surface_label} during measurement ({count} segments)"
        wp_ids = []
        for wp_idx in indices:
            wp_ids.extend([f"idx:{wp_idx - 1}", f"idx:{wp_idx}"])
        # deduplicate while preserving order
        seen: set[str] = set()
        unique_ids: list[str] = []
        for wid in wp_ids:
            if wid not in seen:
                seen.add(wid)
                unique_ids.append(wid)
        non_aborting_violations.append((msg, unique_ids))

    # final validation of assembled path
    final_buffer = (
        data.mission.default_buffer_distance
        if data.mission.default_buffer_distance is not None
        else settings.vertex_buffer_m
    )
    final_violations = validate_inspection_pass(
        db,
        all_waypoints,
        drone,
        data.constraints,
        data.obstacles,
        data.safety_zones,
        data.surfaces,
        elevation_provider=provider,
        buffer_distance=final_buffer,
    )
    final_hard = [v for v in final_violations if not v.is_warning]
    if final_hard:
        raise TrajectoryGenerationError(
            "final validation failed",
            violations=[
                {
                    "message": v.message,
                    "violation_kind": v.violation_kind,
                    "constraint_id": v.constraint_id,
                    "waypoint_index": v.waypoint_index,
                }
                for v in final_hard
            ],
        )

    _format_soft_warnings(final_violations, "final validation", warnings)

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
            total_dur += d / max(cur.speed or MIN_SPEED_FLOOR, MIN_SPEED_FLOOR)

        if all_waypoints[j].hover_duration is not None:
            total_dur += all_waypoints[j].hover_duration

    flight_plan = persist_flight_plan(
        db,
        mission,
        all_waypoints,
        warnings,
        total_dist,
        total_dur,
        violations=non_aborting_violations,
        suggestions=suggestions,
    )

    # no hard violations at this point - mark flight plan as validated
    flight_plan.is_validated = True

    # transition to PLANNED only if still in DRAFT (skip if already PLANNED from regression)
    if mission.status == MissionStatus.DRAFT:
        mission.transition_to(MissionStatus.PLANNED)

    mission.has_unsaved_map_changes = False
    db.commit()

    return flight_plan, warnings
