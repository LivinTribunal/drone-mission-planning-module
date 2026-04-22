"""per-inspection waypoint generation and orchestrator-only helpers.

over 400 lines because it also hosts the LHA/runway/density helpers that the
coordinator consumes through build_inspection_pass. those helpers don't
justify another module and are test-imported from here already.
"""

from __future__ import annotations

import logging
import math

from app.core.exceptions import TrajectoryGenerationError
from app.models.enums import CameraAction, InspectionMethod, WaypointType
from app.models.value_objects import Coordinate
from app.schemas.geometry import parse_ewkb

from ._common import get_ordered_lha_positions
from .config_resolver import check_sensor_fov, check_speed_framerate, resolve_density, resolve_speed
from .methods import PREPARE_REGISTRY, compute_measurement_trajectory
from .types import (
    DEFAULT_ACCELERATION,
    DEFAULT_ANGLE_OFFSET,
    DEFAULT_DECELERATION,
    DEFAULT_GLIDE_SLOPE,
    DEFAULT_HEADING,
    MIN_ARC_RADIUS,
    MIN_SPEED_FLOOR,
    VERTICAL_POSITION_TOLERANCE_DEG,
    Degrees,
    InspectionPass,
    Point3D,
    WaypointData,
)

logger = logging.getLogger(__name__)


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


def _format_soft_warnings(
    violations: list,
    label: str,
    warnings: list[tuple[str, list[str]]],
    wp_offset: int = 0,
) -> None:
    """group soft violations by message and append formatted warning tuples.

    wp_offset is added to each waypoint_index to convert pass-local indices
    to global all_waypoints indices for later uuid resolution.
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


def _parse_lha_position(lha) -> Point3D | None:
    """parse an LHA's EWKB position into Point3D, or None when missing/invalid."""
    if not lha.position:
        return None
    try:
        c = parse_ewkb(lha.position.data).get("coordinates")
        if not c or len(c) < 3:
            return None
    except (KeyError, ValueError, TypeError):
        return None
    return Point3D(lon=c[0], lat=c[1], alt=c[2])


def get_lha_positions(template, lha_ids: list | None = None) -> list[Point3D]:
    """extract 3D positions from LHA units, optionally filtered by lha_ids."""
    lha_id_set = {str(i) for i in lha_ids} if lha_ids else None

    positions = []
    for agl in template.targets:
        for lha in agl.lhas:
            if lha_id_set and str(lha.id) not in lha_id_set:
                continue
            if not lha.position:
                continue
            try:
                c = parse_ewkb(lha.position.data).get("coordinates")
                if not c or len(c) < 3:
                    continue
            except (KeyError, ValueError, TypeError):
                logger.warning("failed to parse LHA position for lha %s", lha.id)
                continue
            positions.append(Point3D(lon=c[0], lat=c[1], alt=c[2]))

    return positions


def get_lha_positions_from_surfaces(surfaces, lha_ids: list) -> list[Point3D]:
    """resolve LHA positions from all airport surfaces instead of template targets.

    used for AGL-agnostic methods (hover-point-lock) where the template has
    no target AGLs and the operator selects LHAs from any surface.
    """
    lha_id_set = {str(i) for i in lha_ids}
    positions = []
    for surface in surfaces:
        for agl in surface.agls:
            for lha in agl.lhas:
                if str(lha.id) not in lha_id_set:
                    continue
                pos = _parse_lha_position(lha)
                if pos is None:
                    continue
                positions.append(pos)

    return positions


def get_lha_setting_angle_by_id(template, lha_id) -> Degrees | None:
    """return setting angle of a specific lha by id, or none if not found."""
    target_id = str(lha_id)
    for agl in template.targets:
        for lha in agl.lhas:
            if str(lha.id) == target_id:
                return lha.setting_angle
    return None


def get_lha_setting_angles(template, lha_ids=None) -> list[Degrees]:
    """collect and sort setting angles from all LHA units in template."""
    lha_id_set = {str(i) for i in lha_ids} if lha_ids else None

    angles = []
    for agl in template.targets:
        for lha in agl.lhas:
            if lha_id_set and str(lha.id) not in lha_id_set:
                continue
            if lha.setting_angle is not None:
                angles.append(lha.setting_angle)

    return sorted(angles)


def derive_observation_angle(
    setting_angles: list[Degrees],
    angle_offset: Degrees,
) -> Degrees:
    """derive papi observation angle from max lha setting angle + offset.

    places the drone in the all-white zone above all papi transition sectors.
    """
    return max(setting_angles) + angle_offset


def check_missing_setting_angles(template, lha_ids=None) -> list[str]:
    """return unit_designators of lhas with missing setting_angle."""
    lha_id_set = {str(i) for i in lha_ids} if lha_ids else None
    missing = []
    for agl in template.targets:
        for lha in agl.lhas:
            if lha_id_set and str(lha.id) not in lha_id_set:
                continue
            if lha.setting_angle is None:
                missing.append(lha.unit_designator)

    return sorted(missing)


def get_glide_slope_angle(template) -> Degrees:
    """return the first non-null glide slope angle from template targets, or default."""
    for agl in template.targets:
        if agl.glide_slope_angle is not None:
            angle = agl.glide_slope_angle
            if not (0 < angle < 90):
                raise ValueError(f"glide slope angle {angle} out of valid range (0-90)")
            return angle

    return DEFAULT_GLIDE_SLOPE


def get_runway_heading(template, surfaces) -> Degrees:
    """return the heading of the runway surface associated with the template."""
    for agl in template.targets:
        for surface in surfaces:
            if surface.id == agl.surface_id and surface.heading:
                return surface.heading

    return DEFAULT_HEADING


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


def append_vertical_profile_descent(
    pass_wps: list[WaypointData],
    method: InspectionMethod,
    speed: float,
) -> None:
    """for vertical profiles ending above start xy, add a descent waypoint back to start alt.

    mutates pass_wps in place when the profile's last xy matches the first.
    """
    if method != InspectionMethod.VERTICAL_PROFILE:
        return
    if len(pass_wps) < 2:
        return
    if (
        abs(pass_wps[0].lon - pass_wps[-1].lon) < VERTICAL_POSITION_TOLERANCE_DEG
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


def append_descent_to_transit_altitude(
    pass_wps: list[WaypointData],
    center: Point3D,
    speed: float,
    elevation_provider,
    transit_agl: float,
) -> None:
    """append a descent-to-transit waypoint when the pass ends well above cruise."""
    if not pass_wps:
        return
    last_wp = pass_wps[-1]
    if elevation_provider:
        ground_at_descent = elevation_provider.get_elevation(last_wp.lat, last_wp.lon)
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


def build_inspection_pass(
    inspection,
    mission,
    data,
    transit_agl: float,
    warnings: list[tuple[str, list[str]]],
    suggestions: list[tuple[str, list[str]]],
    resolve_config_fn,
) -> tuple[InspectionPass | None, list, list[int], float, float] | None:
    """generate a single inspection pass.

    returns (pass, violations, obstructed_wp_indices, seg_dist, seg_dur) or None
    when the inspection is skipped. also mutates warnings/suggestions lists.

    resolve_config_fn injects mission defaults onto the resolved config and
    also records suggestions for defaulted fields. it returns the resolved
    config and the pass label.
    """
    # local imports keep the coordinator/segment_builder pair from pulling the
    # entire pathfinding subpackage into every segment_builder import path.
    from app.utils.geo import distance_between, total_path_distance

    from .pathfinding import has_line_of_sight, resolve_inspection_collisions
    from .validation import validate_inspection_pass

    drone = data.drone
    default_speed = data.default_speed
    local_geoms = data.local_geoms
    require_perpendicular = mission.require_perpendicular_runway_crossing

    template = inspection.template
    config, label = resolve_config_fn(inspection)

    lha_ids = inspection.lha_ids
    lha_positions = get_lha_positions(template, lha_ids)

    # AGL-agnostic methods (hover-point-lock) may have LHAs outside template targets
    if not lha_positions and lha_ids:
        lha_positions = get_lha_positions_from_surfaces(data.surfaces, lha_ids)

    if not lha_positions:
        if inspection.method == InspectionMethod.HOVER_POINT_LOCK:
            raise TrajectoryGenerationError(
                f"{template.name} #{inspection.sequence_order}: "
                "hover-point-lock requires a selected LHA"
            )
        warnings.append(
            (
                f"{template.name} #{inspection.sequence_order}: no LHA positions",
                [],
            )
        )
        return None

    center = Point3D.center(lha_positions)

    glide_slope = get_glide_slope_angle(template)
    rwy_heading = get_runway_heading(template, data.surfaces)
    setting_angles = get_lha_setting_angles(template, lha_ids)

    # derive observation angle from lha setting angles for papi methods
    if inspection.method == InspectionMethod.HORIZONTAL_RANGE:
        missing_units = check_missing_setting_angles(template, lha_ids)
        if missing_units:
            units_str = ", ".join(missing_units)
            warnings.append(
                (
                    f"{label}: LHA unit(s) {units_str} missing setting angle "
                    "- computed observation angle may be inaccurate",
                    [],
                )
            )

        if setting_angles:
            offset = (
                config.angle_offset if config.angle_offset is not None else DEFAULT_ANGLE_OFFSET
            )

            # lha setting angle override - use a specific lha's angle instead of max
            override_id = config.lha_setting_angle_override_id
            if override_id is not None:
                override_angle = get_lha_setting_angle_by_id(template, override_id)
                if override_angle is not None:
                    glide_slope = override_angle + offset
                else:
                    warnings.append(
                        (
                            f"{label}: overridden LHA not found or has no setting angle "
                            "- falling back to max",
                            [],
                        )
                    )
                    glide_slope = derive_observation_angle(setting_angles, offset)
            else:
                glide_slope = derive_observation_angle(setting_angles, offset)
        else:
            warnings.append(
                (
                    f"{label}: no setting angles available - falling back to AGL glide slope angle",
                    [],
                )
            )

    # ordered LHA positions are used by fly-over and parallel-side-sweep
    ordered_lhas = get_ordered_lha_positions(template, lha_ids)
    if config.direction_reversed and inspection.method in (
        InspectionMethod.FLY_OVER,
        InspectionMethod.PARALLEL_SIDE_SWEEP,
    ):
        ordered_lhas = list(reversed(ordered_lhas))

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

    # compute waypoints
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

    # descent waypoints before validation so they're included in the check
    append_vertical_profile_descent(pass_wps, inspection.method, speed)
    append_descent_to_transit_altitude(
        pass_wps, center, speed, data.elevation_provider, transit_agl
    )

    # validate and reroute
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

    # post-inspection processing
    _apply_camera_actions(pass_wps)

    # camera line-of-sight to PAPI for each measurement waypoint
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

    return (
        InspectionPass(waypoints=pass_wps, inspection_id=inspection.id),
        violations,
        obstructed_wps,
        seg_dist,
        seg_dur,
    )
