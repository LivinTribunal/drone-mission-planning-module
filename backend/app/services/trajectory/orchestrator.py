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
from app.utils.geo import bearing_between, distance_between, total_path_distance
from app.utils.local_projection import LocalProjection, build_local_geometries

from .config_resolver import (
    check_sensor_fov,
    check_speed_framerate,
    resolve_density,
    resolve_speed,
    resolve_with_defaults,
)
from .helpers import (
    _apply_camera_actions,
    get_glide_slope_angle,
    get_lha_positions,
    get_lha_positions_from_surfaces,
    get_lha_setting_angles,
    get_ordered_lha_positions,
    get_runway_heading,
)
from .methods import PREPARE_REGISTRY, compute_measurement_trajectory
from .pathfinding import (
    compute_transit_path,
    has_line_of_sight,
    resolve_inspection_collisions,
)
from .safety_validator import (
    check_battery,
    segment_runway_crossing_length,
    validate_inspection_pass,
)
from .types import (
    DEFAULT_ACCELERATION,
    DEFAULT_DECELERATION,
    DEFAULT_RESERVE_MARGIN,
    DEFAULT_SPEED,
    GIMBAL_SETTLE_TIME,
    LANDING_DURATION,
    MIN_ARC_RADIUS,
    MIN_SPEED_FLOOR,
    TAKEOFF_DURATION,
    TRANSIT_AGL,
    VERTICAL_POSITION_TOLERANCE_DEG,
    InspectionPass,
    MissionData,
    Point3D,
    Violation,
    WaypointData,
)


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


def _segment_duration_with_accel(
    distance: float,
    v_start: float,
    v_end: float,
    accel: float = DEFAULT_ACCELERATION,
    decel: float = DEFAULT_DECELERATION,
) -> float:
    """compute segment travel time using a trapezoidal speed profile.

    models acceleration from v_start to cruise speed, constant cruise, then
    deceleration to v_end. falls back to triangular profile when the segment
    is too short for full accel/decel phases.
    """
    if distance <= 0:
        return 0.0
    v_start = max(v_start, MIN_SPEED_FLOOR)
    v_end = max(v_end, MIN_SPEED_FLOOR)
    v_cruise = max(v_start, v_end)

    # distance needed for accel and decel phases
    d_accel = (v_cruise**2 - v_start**2) / (2 * accel) if v_cruise > v_start else 0.0
    d_decel = (v_cruise**2 - v_end**2) / (2 * decel) if v_cruise > v_end else 0.0

    if d_accel + d_decel <= distance:
        # full trapezoidal profile
        d_cruise = distance - d_accel - d_decel
        t_accel = (v_cruise - v_start) / accel if v_cruise > v_start else 0.0
        t_decel = (v_cruise - v_end) / decel if v_cruise > v_end else 0.0
        t_cruise = d_cruise / v_cruise if v_cruise > 0 else 0.0
        return t_accel + t_cruise + t_decel

    # triangular profile - can't reach cruise speed
    # solve for peak velocity: d_accel + d_decel = distance
    # v_peak^2 = (2*accel*decel*distance + decel*v_start^2 + accel*v_end^2) / (accel + decel)
    numerator = 2 * accel * decel * distance + decel * v_start**2 + accel * v_end**2
    denominator = accel + decel
    if denominator == 0:
        return distance / max(v_start, MIN_SPEED_FLOOR)
    v_peak_sq = numerator / denominator
    if v_peak_sq < 0:
        return distance / max(v_start, MIN_SPEED_FLOOR)
    v_peak = math.sqrt(v_peak_sq)
    t_accel = (v_peak - v_start) / accel if v_peak > v_start else 0.0
    t_decel = (v_peak - v_end) / decel if v_peak > v_end else 0.0
    return t_accel + t_decel


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
    # eager-load surface -> agls -> lhas so hover-point-lock's AGL-agnostic
    # lookup (find_lha_in_surfaces) doesn't trigger N+1 lazy loads on the
    # trajectory critical path.
    surfaces = (
        db.query(AirfieldSurface)
        .options(joinedload(AirfieldSurface.agls).joinedload(AGL.lhas))
        .filter(AirfieldSurface.airport_id == airport.id)
        .all()
    )

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

    scope = mission.flight_plan_scope or "FULL"

    # pre-check: takeoff/landing coordinates required unless scope is MEASUREMENTS_ONLY
    if scope != "MEASUREMENTS_ONLY":
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

    # operator opt-in: allow shortest-geodesic crossing instead of perpendicular,
    # reducing the runway closure window. defaults True for legacy behavior.
    require_perpendicular = data.mission.require_perpendicular_runway_crossing

    # set up local projection centered on airport for Shapely-based pathfinding
    airport_coords = _parse_coordinate(data.airport.location.data, "airport")
    proj = LocalProjection(ref_lon=airport_coords[0], ref_lat=airport_coords[1])
    local_geoms = build_local_geometries(proj, data.obstacles, data.safety_zones, data.surfaces)

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

        # inject mission-level measurement speed override when neither inspection
        # nor template set it
        insp_ms = (
            getattr(inspection.config, "measurement_speed_override", None)
            if inspection.config
            else None
        )
        tmpl_ms = (
            getattr(template.default_config, "measurement_speed_override", None)
            if template.default_config
            else None
        )
        if insp_ms is None and tmpl_ms is None and mission.measurement_speed_override is not None:
            config.measurement_speed_override = mission.measurement_speed_override

        # generate suggestions for fields using template defaults
        label = f"{template.name} #{inspection.sequence_order}"
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

        # AGL-agnostic methods (hover-point-lock) may have LHAs outside template targets
        if not lha_positions and lha_ids:
            lha_positions = get_lha_positions_from_surfaces(data.surfaces, lha_ids)

        if not lha_positions:
            if inspection.method == InspectionMethod.HOVER_POINT_LOCK:
                # let the prepare function raise a specific error
                center = Point3D(0, 0, 0)
            else:
                warnings.append(
                    (
                        f"{template.name} #{inspection.sequence_order}: no LHA positions",
                        [],
                    )
                )
                continue
        else:
            center = Point3D.center(lha_positions)

        glide_slope = get_glide_slope_angle(template)
        rwy_heading = get_runway_heading(template, data.surfaces)
        setting_angles = get_lha_setting_angles(template, lha_ids)

        # ordered LHA positions are used by fly-over and parallel-side-sweep
        ordered_lhas = get_ordered_lha_positions(template, lha_ids)

        # method-specific pre-computation via registry
        prepare_fn = PREPARE_REGISTRY.get(inspection.method)
        if prepare_fn is None:
            raise TrajectoryGenerationError(f"unsupported inspection method: {inspection.method}")

        prep = prepare_fn(
            inspection=inspection,
            config=config,
            center=center,
            rwy_heading=rwy_heading,
            glide_slope=glide_slope,
            ordered_lhas=ordered_lhas,
            default_speed=default_speed,
            template=template,
            surfaces=data.surfaces,
            label=label,
        )

        runway_center = prep.runway_center
        target_lha_pos = prep.target_lha_pos
        target_agl_type = prep.target_agl_type
        if prep.rwy_heading_override is not None:
            rwy_heading = prep.rwy_heading_override

        # suggest optimal density without overriding user's choice
        _, density_suggestion = resolve_density(inspection.method, setting_angles, config)
        if density_suggestion:
            suggestions.append(
                (
                    f"{template.name} #{inspection.sequence_order}: {density_suggestion}",
                    [],
                )
            )

        speed, speed_warning, optimal_speed = resolve_speed(
            prep.path_distance, prep.density_for_speed, drone, prep.default_speed
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

            # separate check for measurement speed when it differs from transit
            if config.measurement_speed_override is not None:
                ms_warning = check_speed_framerate(
                    config.measurement_speed_override, drone, optimal_speed
                )
                if ms_warning:
                    warnings.append((f"measurement speed: {ms_warning}", []))

        if drone and prep.needs_fov_check:
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
            pass_wps,
            drone,
            data.constraints,
            local_geoms,
            elevation_provider=data.elevation_provider,
            buffer_distance=config.buffer_distance,
        )

        obstacle_violations = [
            v for v in violations if not v.is_warning and v.violation_kind == "obstacle"
        ]

        if obstacle_violations:
            pass_wps = resolve_inspection_collisions(
                pass_wps,
                local_geoms,
                center,
                buffer_distance_override=config.buffer_distance,
                require_perpendicular_runway_crossing=require_perpendicular,
            )

            # re-validate after rerouting
            violations = validate_inspection_pass(
                pass_wps,
                drone,
                data.constraints,
                local_geoms,
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
            if not has_line_of_sight(wp_pt, center, local_geoms):
                obstructed_wps.append(wp_idx)

        points = [(wp.lon, wp.lat, wp.alt) for wp in pass_wps]
        seg_dist = total_path_distance(points)

        # use trapezoidal profile to match final flight-plan duration calculation
        seg_dur = 0.0
        for j in range(1, len(pass_wps)):
            prev_wp = pass_wps[j - 1]
            cur_wp = pass_wps[j]
            h = distance_between(prev_wp.lon, prev_wp.lat, cur_wp.lon, cur_wp.lat)
            d = math.sqrt(h**2 + (cur_wp.alt - prev_wp.alt) ** 2)
            s_prev = prev_wp.speed if prev_wp.speed is not None else MIN_SPEED_FLOOR
            s_cur = cur_wp.speed if cur_wp.speed is not None else MIN_SPEED_FLOOR
            v_prev = max(s_prev, MIN_SPEED_FLOOR)
            v_cur = max(s_cur, MIN_SPEED_FLOOR)
            seg_dur += _segment_duration_with_accel(d, v_prev, v_cur)

        for wp in pass_wps:
            if wp.hover_duration is not None:
                seg_dur += wp.hover_duration

        cumulative_distance += seg_dist
        cumulative_duration += seg_dur

        deferred_pass_data.append((label, violations, obstructed_wps))
        inspection_passes.append(InspectionPass(waypoints=pass_wps, inspection_id=inspection.id))

    if not inspection_passes:
        raise TrajectoryGenerationError("no waypoints generated")

    # phase 5 - final assembly with A* transit
    all_waypoints: list[WaypointData] = []
    measurement_index_maps: list[dict[int, int]] = []

    # terrain helper
    provider = data.elevation_provider

    if scope == "MEASUREMENTS_ONLY":
        # measurements-only: concatenate measurement/hover waypoints from each pass
        # no takeoff, landing, or transit between passes
        pass_start_indices: list[int] = []
        for ipass in inspection_passes:
            idx_map: dict[int, int] = {}
            filtered_idx = 0
            for orig_idx, wp in enumerate(ipass.waypoints):
                if wp.waypoint_type in (WaypointType.MEASUREMENT, WaypointType.HOVER):
                    idx_map[orig_idx] = filtered_idx
                    filtered_idx += 1
            measurement_index_maps.append(idx_map)

            measurement_wps = [
                wp
                for wp in ipass.waypoints
                if wp.waypoint_type in (WaypointType.MEASUREMENT, WaypointType.HOVER)
            ]
            pass_start_indices.append(len(all_waypoints))
            all_waypoints.extend(measurement_wps)

        if not all_waypoints:
            raise TrajectoryGenerationError("no measurement waypoints generated")

    elif scope == "NO_TAKEOFF_LANDING":
        # no-takeoff-landing: start at transit altitude above takeoff point,
        # A* transit between passes, end at transit altitude above landing point

        tc = _parse_coordinate(mission.takeoff_coordinate.data, "takeoff")
        if not inspection_passes[0].waypoints:
            raise TrajectoryGenerationError("first inspection produced no waypoints")
        first_wp = inspection_passes[0].waypoints[0]

        takeoff_alt = tc[2]
        if provider:
            takeoff_alt = provider.get_elevation(tc[1], tc[0])

        # start at transit altitude directly above takeoff position (no ground-level TAKEOFF)
        all_waypoints.append(
            WaypointData(
                lon=tc[0],
                lat=tc[1],
                alt=takeoff_alt + transit_agl,
                heading=bearing_between(tc[0], tc[1], first_wp.lon, first_wp.lat),
                speed=default_speed,
                waypoint_type=WaypointType.TRANSIT,
                camera_action=CameraAction.NONE,
            )
        )

        pass_start_indices = []
        for i, ipass in enumerate(inspection_passes):
            prev = all_waypoints[-1]
            start = ipass.waypoints[0]
            from_pt = Point3D(lon=prev.lon, lat=prev.lat, alt=prev.alt)
            to_pt = Point3D(lon=start.lon, lat=start.lat, alt=start.alt)

            transit_wps = compute_transit_path(
                from_pt,
                to_pt,
                local_geoms,
                default_speed,
                elevation_provider=provider,
                transit_agl=transit_agl,
                buffer_distance_override=mission_buffer_override,
                require_perpendicular_runway_crossing=require_perpendicular,
            )
            all_waypoints.extend(transit_wps)

            pass_start_indices.append(len(all_waypoints))
            all_waypoints.extend(ipass.waypoints)

        lc = _parse_coordinate(mission.landing_coordinate.data, "landing")
        landing_alt = lc[2]
        if provider:
            landing_alt = provider.get_elevation(lc[1], lc[0])

        last = all_waypoints[-1]
        from_pt = Point3D(lon=last.lon, lat=last.lat, alt=last.alt)
        # transit to above landing position at transit altitude (no ground-level LANDING)
        to_pt = Point3D(lon=lc[0], lat=lc[1], alt=landing_alt + transit_agl)

        landing_transit = compute_transit_path(
            from_pt,
            to_pt,
            local_geoms,
            default_speed,
            elevation_provider=provider,
            transit_agl=transit_agl,
            buffer_distance_override=mission_buffer_override,
            require_perpendicular_runway_crossing=require_perpendicular,
        )
        all_waypoints.extend(landing_transit)

    else:
        # FULL scope (default): takeoff at ground level -> climb -> transit -> landing
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
            climb_alt = takeoff_alt + transit_agl
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

        pass_start_indices = []
        for i, ipass in enumerate(inspection_passes):
            # A* transit from previous endpoint to this pass start
            if all_waypoints:
                prev = all_waypoints[-1]
                start = ipass.waypoints[0]
                from_pt = Point3D(lon=prev.lon, lat=prev.lat, alt=prev.alt)
                to_pt = Point3D(lon=start.lon, lat=start.lat, alt=start.alt)

                transit_wps = compute_transit_path(
                    from_pt,
                    to_pt,
                    local_geoms,
                    default_speed,
                    elevation_provider=provider,
                    transit_agl=transit_agl,
                    buffer_distance_override=mission_buffer_override,
                    require_perpendicular_runway_crossing=require_perpendicular,
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
                from_pt,
                to_pt,
                local_geoms,
                default_speed,
                elevation_provider=provider,
                transit_agl=transit_agl,
                buffer_distance_override=mission_buffer_override,
                require_perpendicular_runway_crossing=require_perpendicular,
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
    is_measurements_only = scope == "MEASUREMENTS_ONLY"
    for i, (pass_start, ipass) in enumerate(zip(pass_start_indices, inspection_passes)):
        pass_wp_count = (
            len(measurement_index_maps[i]) if is_measurements_only else len(ipass.waypoints)
        )
        for k in range(pass_start, pass_start + pass_wp_count):
            if k < len(all_waypoints):
                wp_inspection_seq[k] = i + 1

        # format deferred per-pass warnings now that global offsets are known
        if i < len(deferred_pass_data):
            d_label, d_violations, d_obstructed = deferred_pass_data[i]

            if is_measurements_only:
                # remap violation waypoint indices from full-pass to filtered-pass
                idx_map = measurement_index_maps[i]
                remapped_violations = []
                for v in d_violations:
                    if v.waypoint_index is not None and v.waypoint_index not in idx_map:
                        continue
                    if v.waypoint_index is not None:
                        v = Violation(
                            is_warning=v.is_warning,
                            message=v.message,
                            violation_kind=v.violation_kind,
                            constraint_id=v.constraint_id,
                            waypoint_index=idx_map[v.waypoint_index],
                        )
                    remapped_violations.append(v)
                _format_soft_warnings(remapped_violations, d_label, warnings, wp_offset=pass_start)

                d_obstructed = [idx_map[wi] for wi in d_obstructed if wi in idx_map]
            else:
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
        prev_x, prev_y = proj.to_local(prev_wp.lon, prev_wp.lat)
        cur_x, cur_y = proj.to_local(cur_wp.lon, cur_wp.lat)
        for local_surface in local_geoms.surfaces:
            crossing = segment_runway_crossing_length(
                prev_x,
                prev_y,
                cur_x,
                cur_y,
                local_surface.polygon,
            )
            if crossing > 0:
                wp_type = cur_wp.waypoint_type
                if wp_type == WaypointType.MEASUREMENT:
                    seq = wp_inspection_seq.get(j, 0)
                    key = (
                        seq,
                        f"{local_surface.surface_type} {local_surface.identifier}",
                    )
                    measurement_crossings.setdefault(key, []).append(j)
                else:
                    msg = (
                        f"wp {j}-{j + 1} ({wp_type}): crosses "
                        f"{local_surface.surface_type} {local_surface.identifier} "
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
        all_waypoints,
        drone,
        data.constraints,
        local_geoms,
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

    # compute final totals with trapezoidal speed profile
    total_dist = 0.0
    tl_fixed = TAKEOFF_DURATION + LANDING_DURATION if scope == "FULL" else 0.0
    total_dur = tl_fixed
    for j in range(len(all_waypoints)):
        if j > 0:
            prev = all_waypoints[j - 1]
            cur = all_waypoints[j]
            seg = distance_between(prev.lon, prev.lat, cur.lon, cur.lat)
            altitude_diff = cur.alt - prev.alt
            d = math.sqrt(seg**2 + altitude_diff**2)
            total_dist += d

            v_prev = max(
                prev.speed if prev.speed is not None else MIN_SPEED_FLOOR,
                MIN_SPEED_FLOOR,
            )
            v_cur = max(
                cur.speed if cur.speed is not None else MIN_SPEED_FLOOR,
                MIN_SPEED_FLOOR,
            )
            total_dur += _segment_duration_with_accel(d, v_prev, v_cur)

            # gimbal settle when transitioning between segment types
            if prev.waypoint_type != cur.waypoint_type and cur.waypoint_type in (
                WaypointType.MEASUREMENT,
                WaypointType.HOVER,
            ):
                total_dur += GIMBAL_SETTLE_TIME

        if all_waypoints[j].hover_duration is not None:
            total_dur += all_waypoints[j].hover_duration

    # battery check after all phases including transit durations
    if drone:
        bw = check_battery(total_dur, drone, DEFAULT_RESERVE_MARGIN)
        if bw:
            warnings.append((bw.message, []))

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
