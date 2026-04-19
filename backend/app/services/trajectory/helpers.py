import logging
import math

from app.core.exceptions import TrajectoryGenerationError
from app.models.enums import CameraAction, InspectionMethod, WaypointType
from app.schemas.geometry import parse_ewkb
from app.utils.geo import elevation_angle, point_at_distance

from .types import (
    DEFAULT_GLIDE_SLOPE,
    DEFAULT_HEADING,
    DEFAULT_HORIZONTAL_DISTANCE,
    DEFAULT_SWEEP_ANGLE,
    MAX_ELEVATION_ANGLE,
    MIN_ARC_RADIUS,
    MIN_ELEVATION_ANGLE,
    Degrees,
    Meters,
    Point3D,
    ResolvedConfig,
    WaypointData,
)

logger = logging.getLogger(__name__)


def _designator_sort_key(designator: str | None) -> tuple:
    """sort key that orders numeric designators numerically and alpha ones lexically."""
    d = designator or ""
    try:
        return (0, int(d), "")
    except (ValueError, TypeError):
        return (1, 0, d)


def _opposite_bearing(heading: Degrees) -> Degrees:
    """bearing 180 degrees opposite of given heading, wrapped to [0, 360)."""
    return (heading + 180) % 360


def get_ordered_lha_positions(template, lha_ids: list | None = None) -> list[Point3D]:
    """extract LHA positions sorted by unit_designator within each AGL."""
    lha_id_set = {str(i) for i in lha_ids} if lha_ids else None

    positions = []
    for agl in template.targets:
        ordered = sorted(
            (lha for lha in agl.lhas if lha.position),
            key=lambda lha: _designator_sort_key(lha.unit_designator),
        )
        for lha in ordered:
            if lha_id_set and str(lha.id) not in lha_id_set:
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


def find_lha_by_id(template, lha_id) -> tuple[Point3D, object] | None:
    """locate a single LHA position by id across all template AGLs.

    returns (position, parent_agl) or None when not found.
    """
    target = str(lha_id)
    for agl in template.targets:
        for lha in agl.lhas:
            if str(lha.id) != target:
                continue
            pos = _parse_lha_position(lha)
            if pos is None:
                return None
            return pos, agl

    return None


def find_lha_in_surfaces(surfaces, lha_id) -> tuple[Point3D, object] | None:
    """locate a single LHA position by id across all AGLs of a surface list.

    used for AGL-agnostic methods (hover-point-lock) where the template does
    not constrain which LHA the operator may choose.
    returns (position, parent_agl) or None when not found.
    """
    target = str(lha_id)
    for surface in surfaces:
        for agl in surface.agls:
            for lha in agl.lhas:
                if str(lha.id) != target:
                    continue
                pos = _parse_lha_position(lha)
                if pos is None:
                    return None
                return pos, agl

    return None


def get_lha_positions(template, lha_ids: list | None = None) -> list[Point3D]:
    """extract 3D positions from LHA units, optionally filtered by lha_ids."""
    # precompute set to avoid O(m*n) list rebuild per iteration
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


def get_lha_setting_angles(template, lha_ids=None) -> list[Degrees]:
    """collect and sort setting angles from all LHA units in template."""
    # precompute set to avoid O(m*n) list rebuild per iteration
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


def get_runway_centerline_midpoint(template, surfaces) -> Point3D | None:
    """return the midpoint of the runway centerline for the template's surface.

    parallel-side-sweep needs a point ON the runway centerline to orient the
    perpendicular offset direction away from the runway. the LHA row centroid
    is NOT a substitute - both perpendicular candidates are equidistant from it.
    """
    for agl in template.targets:
        for surface in surfaces:
            if surface.id != agl.surface_id or surface.geometry is None:
                continue
            try:
                line = parse_ewkb(surface.geometry.data)
            except (KeyError, ValueError, TypeError):
                continue
            coords = line.get("coordinates") or []
            if len(coords) < 2:
                continue
            start = coords[0]
            end = coords[-1]
            mid_lon = (start[0] + end[0]) / 2
            mid_lat = (start[1] + end[1]) / 2
            mid_alt = (start[2] + end[2]) / 2 if len(start) >= 3 and len(end) >= 3 else 0.0
            return Point3D(lon=mid_lon, lat=mid_lat, alt=mid_alt)

    return None


def determine_start_position(
    center: Point3D,
    config: ResolvedConfig,
    method: InspectionMethod,
    runway_heading: Degrees,
    glide_slope: Degrees,
) -> Point3D:
    """compute start position of inspection pass based on method and geometry."""
    # arc sweep is on the approach side (facing the PAPI front)
    approach = _opposite_bearing(runway_heading)

    match method:
        case InspectionMethod.PAPI_HORIZONTAL_RANGE:
            radius = config.horizontal_distance or MIN_ARC_RADIUS
            half_sweep = DEFAULT_SWEEP_ANGLE if config.sweep_angle is None else config.sweep_angle
            angle = approach - half_sweep
            lon, lat = point_at_distance(center.lon, center.lat, angle, radius)
            alt = center.alt + radius * math.tan(math.radians(glide_slope))

            return Point3D(lon=lon, lat=lat, alt=alt + config.altitude_offset)

        case InspectionMethod.VERTICAL_PROFILE:
            distance = (
                config.horizontal_distance
                if config.horizontal_distance is not None
                else DEFAULT_HORIZONTAL_DISTANCE
            )
            lon, lat = point_at_distance(center.lon, center.lat, approach, distance)
            alt = center.alt + distance * math.tan(math.radians(MIN_ELEVATION_ANGLE))

            return Point3D(lon=lon, lat=lat, alt=alt + config.altitude_offset)

    raise ValueError(f"unsupported inspection method: {method}")


def _vertical_profile_max_elevation(distance: Meters, config: ResolvedConfig) -> Degrees:
    """max elevation angle for a vertical profile at the given horizontal distance.

    when vertical_profile_height is set, the top of the profile sits at
    center.alt + vertical_profile_height, so the max elevation follows from
    the triangle (height, distance). otherwise falls back to MAX_ELEVATION_ANGLE.
    """
    if config.vertical_profile_height is not None and distance > 0:
        return math.degrees(math.atan2(config.vertical_profile_height, distance))
    return MAX_ELEVATION_ANGLE


def determine_end_position(
    center: Point3D,
    config: ResolvedConfig,
    method: InspectionMethod,
    runway_heading: Degrees,
    glide_slope: Degrees,
) -> Point3D:
    """compute end position of inspection pass based on method and geometry."""
    approach = _opposite_bearing(runway_heading)

    match method:
        case InspectionMethod.PAPI_HORIZONTAL_RANGE:
            radius = config.horizontal_distance or MIN_ARC_RADIUS
            half_sweep = DEFAULT_SWEEP_ANGLE if config.sweep_angle is None else config.sweep_angle
            angle = approach + half_sweep
            lon, lat = point_at_distance(center.lon, center.lat, angle, radius)
            alt = center.alt + radius * math.tan(math.radians(glide_slope))

            return Point3D(lon=lon, lat=lat, alt=alt + config.altitude_offset)

        case InspectionMethod.VERTICAL_PROFILE:
            distance = (
                config.horizontal_distance
                if config.horizontal_distance is not None
                else DEFAULT_HORIZONTAL_DISTANCE
            )
            lon, lat = point_at_distance(center.lon, center.lat, approach, distance)
            max_elev = _vertical_profile_max_elevation(distance, config)
            alt = center.alt + distance * math.tan(math.radians(max_elev))

            return Point3D(lon=lon, lat=lat, alt=alt + config.altitude_offset)

    raise ValueError(f"unsupported inspection method: {method}")


def _insert_video_hover_waypoints(
    waypoints: list[WaypointData],
    config: ResolvedConfig,
) -> list[WaypointData]:
    """wrap measurement waypoints with recording start/stop hover waypoints for video mode."""
    if not waypoints:
        return waypoints

    first = waypoints[0]
    last = waypoints[-1]
    setup_dur = config.recording_setup_duration

    start_hover = WaypointData(
        lon=first.lon,
        lat=first.lat,
        alt=first.alt,
        heading=first.heading,
        speed=first.speed,
        waypoint_type=WaypointType.HOVER,
        camera_action=CameraAction.RECORDING_START,
        camera_target=first.camera_target,
        inspection_id=first.inspection_id,
        hover_duration=setup_dur,
        gimbal_pitch=first.gimbal_pitch,
    )

    stop_hover = WaypointData(
        lon=last.lon,
        lat=last.lat,
        alt=last.alt,
        heading=last.heading,
        speed=last.speed,
        waypoint_type=WaypointType.HOVER,
        camera_action=CameraAction.RECORDING_STOP,
        camera_target=last.camera_target,
        inspection_id=last.inspection_id,
        hover_duration=setup_dur,
        gimbal_pitch=last.gimbal_pitch,
    )

    return [start_hover, *waypoints, stop_hover]


def _apply_terrain_delta(
    waypoints: list[WaypointData],
    center: Point3D,
    elevation_provider,
) -> None:
    """shift waypoint altitudes by terrain difference from center point.

    center.alt must already be ground-truthed to terrain elevation at the
    PAPI location (done in orchestrator). this function adjusts each waypoint
    by the terrain delta relative to center, preserving glide slope geometry
    while following terrain undulation. recalculates gimbal pitch after shift.
    """
    if not elevation_provider or not waypoints:
        return

    # batch query all waypoint positions + center
    points = [(wp.lat, wp.lon) for wp in waypoints]
    points.append((center.lat, center.lon))
    elevations = elevation_provider.get_elevations_batch(points)
    if len(elevations) != len(points):
        raise TrajectoryGenerationError(f"expected {len(points)} elevations, got {len(elevations)}")

    ground_at_center = elevations[-1]
    for i, wp in enumerate(waypoints):
        terrain_delta = elevations[i] - ground_at_center
        wp.alt += terrain_delta

        # recalculate gimbal pitch - original was computed at pre-terrain altitude
        if wp.camera_target:
            wp.gimbal_pitch = elevation_angle(
                wp.lon,
                wp.lat,
                wp.alt,
                center.lon,
                center.lat,
                center.alt,
            )


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
