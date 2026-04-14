import logging
import math
from uuid import UUID

from app.core.exceptions import TrajectoryGenerationError
from app.models.enums import CameraAction, InspectionMethod, WaypointType
from app.models.inspection import CONFIG_FIELDS, InspectionConfiguration
from app.models.mission import DroneProfile
from app.schemas.geometry import parse_ewkb
from app.services.trajectory_types import (
    DEFAULT_FLY_OVER_GIMBAL,
    DEFAULT_FLY_OVER_HEIGHT,
    DEFAULT_GLIDE_SLOPE,
    DEFAULT_HEADING,
    DEFAULT_HORIZONTAL_DISTANCE,
    DEFAULT_HOVER_DISTANCE_PAPI,
    DEFAULT_HOVER_DISTANCE_RUNWAY,
    DEFAULT_HOVER_DURATION,
    DEFAULT_HOVER_HEIGHT,
    DEFAULT_PARALLEL_HEIGHT,
    DEFAULT_PARALLEL_OFFSET,
    DEFAULT_SWEEP_ANGLE,
    HOVER_ANGLE_TOLERANCE,
    MAX_ELEVATION_ANGLE,
    MIN_ARC_RADIUS,
    MIN_ELEVATION_ANGLE,
    MIN_LHA_FOR_FOV_CHECK,
    SPEED_FRAMERATE_MARGIN,
    Degrees,
    Meters,
    MetersPerSecond,
    Point3D,
    ResolvedConfig,
    WaypointData,
)
from app.utils.geo import (
    angular_span_at_distance,
    bearing_between,
    distance_between,
    elevation_angle,
    point_at_distance,
)

logger = logging.getLogger(__name__)


def _opposite_bearing(heading: Degrees) -> Degrees:
    """bearing 180 degrees opposite of given heading, wrapped to [0, 360)."""
    return (heading + 180) % 360


def overlay_config(result: ResolvedConfig, config: InspectionConfiguration) -> None:
    """overlay non-None fields from an ORM config onto resolved config."""
    for key in CONFIG_FIELDS:
        val = getattr(config, key, None)
        if val is not None:
            setattr(result, key, val)


def resolve_with_defaults(inspection, template) -> ResolvedConfig:
    """field-by-field merge: override > template > hardcoded, delegates to model."""
    result = ResolvedConfig()

    if inspection.config:
        merged = inspection.config.resolve_with_defaults(template.default_config)
        for key, val in merged.items():
            if val is not None:
                setattr(result, key, val)
    elif template.default_config:
        overlay_config(result, template.default_config)

    return result


def get_ordered_lha_positions(template, lha_ids: list | None = None) -> list[Point3D]:
    """extract LHA positions sorted by unit_number within each AGL."""
    lha_id_set = {str(i) for i in lha_ids} if lha_ids else None

    positions = []
    for agl in template.targets:
        ordered = sorted(
            (lha for lha in agl.lhas if lha.position),
            key=lambda lha: lha.unit_number if lha.unit_number is not None else 0,
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


def compute_optimal_density(
    method: InspectionMethod,
    setting_angles: list[Degrees],
    config: ResolvedConfig,
) -> int | None:
    """compute minimum density to capture all transition angles.

    for vertical profiles with setting angles, the step must be
    <= 2 * HOVER_ANGLE_TOLERANCE so every setting angle has at least
    one waypoint within tolerance.
    for arc sweeps, at least one point per degree of sweep.
    """
    match method:
        case InspectionMethod.VERTICAL_PROFILE if setting_angles:
            angular_range = MAX_ELEVATION_ANGLE - MIN_ELEVATION_ANGLE
            # step must be small enough to land within tolerance of each angle
            max_step = 2 * HOVER_ANGLE_TOLERANCE
            optimal = math.ceil(angular_range / max_step) + 1

            return optimal

        case InspectionMethod.ANGULAR_SWEEP:
            half_sweep = DEFAULT_SWEEP_ANGLE if config.sweep_angle is None else config.sweep_angle
            # at least one point per degree of sweep
            optimal = math.ceil(2 * half_sweep) + 1

            return optimal

    return None


def compute_optimal_speed(
    path_distance: Meters,
    density: int,
    drone,
) -> MetersPerSecond | None:
    """compute speed that ensures camera captures at least one frame per waypoint spacing.

    at speed v and frame_rate f, the camera captures every v/f meters.
    for useful measurements, capture spacing must be <= waypoint spacing,
    so: v <= waypoint_spacing * frame_rate.
    """
    if not drone or not drone.camera_frame_rate or density < 2:
        return None
    if path_distance <= 0:
        return None

    # explicit guard preserves the density >= 2 invariant right at the division site
    if density <= 1:
        return None

    waypoint_spacing = path_distance / (density - 1)
    optimal = waypoint_spacing * drone.camera_frame_rate

    # clamp to drone max speed with safety margin
    if drone.max_speed:
        optimal = min(optimal, drone.max_speed * SPEED_FRAMERATE_MARGIN)

    return round(optimal, 1)


def check_speed_framerate(
    speed: MetersPerSecond,
    drone: DroneProfile,
    optimal_speed: MetersPerSecond | None = None,
) -> str | None:
    """check if speed is compatible with camera frame rate."""
    if not drone.camera_frame_rate:
        return None

    if optimal_speed is not None and speed > optimal_speed:
        return (
            f"speed {speed:.1f} m/s exceeds optimal {optimal_speed:.1f} m/s "
            f"for frame rate {drone.camera_frame_rate} fps"
        )

    # fallback check only when optimal_speed could not be computed
    max_framerate_speed = (drone.max_speed or 0) * SPEED_FRAMERATE_MARGIN
    if optimal_speed is None and drone.max_speed and speed > max_framerate_speed:
        return f"speed {speed:.1f} m/s may be too high for frame rate {drone.camera_frame_rate} fps"

    return None


def check_sensor_fov(
    drone, lha_positions: list[Point3D], distance: Meters, approach_heading: Degrees = 0.0
) -> str | None:
    """verify camera field of view covers all LHA units at the given distance."""
    if not drone.sensor_fov or len(lha_positions) < MIN_LHA_FOR_FOV_CHECK:
        return None

    tuples = [p.to_tuple() for p in lha_positions]
    center = Point3D.center(lha_positions)
    obs_lon, obs_lat = point_at_distance(center.lon, center.lat, approach_heading, distance)
    span = angular_span_at_distance(tuples, obs_lon, obs_lat)

    if span > drone.sensor_fov:
        return (
            f"LHA array span {span:.1f} exceeds sensor FOV "
            f"{drone.sensor_fov:.1f} at {distance:.0f}m"
        )

    return None


def resolve_density(
    method: InspectionMethod,
    setting_angles: list[Degrees],
    config: ResolvedConfig,
) -> tuple[int, str | None]:
    """resolve measurement density, auto-increasing if optimal exceeds configured value.

    returns the final density and an optional warning string if auto-increased.
    """
    optimal = compute_optimal_density(method, setting_angles, config)
    if optimal is not None and config.measurement_density < optimal:
        warning = f"density auto-set to {optimal} to capture all transition angles"
        return optimal, warning

    return config.measurement_density, None


def resolve_speed(
    config: ResolvedConfig,
    path_distance: Meters,
    density: int,
    drone,
    default_speed: MetersPerSecond,
) -> tuple[MetersPerSecond, str | None, MetersPerSecond | None]:
    """resolve measurement speed from override, optimal calculation, or default.

    optimal speed is the max that still captures one frame per waypoint spacing,
    clamped to default_speed so measurement passes stay slow and precise.
    returns (final_speed, optional_warning, optimal_speed).
    """
    optimal = compute_optimal_speed(path_distance, density, drone)

    if config.speed_override is not None:
        chosen = config.speed_override
    elif optimal is not None:
        # use optimal for frame rate but never exceed default speed
        chosen = min(optimal, default_speed)
    else:
        chosen = default_speed

    # warn if chosen speed exceeds camera frame rate ceiling
    warning = None
    if optimal is not None and chosen > optimal:
        warning = (
            f"speed {chosen:.1f} m/s exceeds camera frame rate ceiling "
            f"{optimal:.1f} m/s - frames may be missed"
        )

    return chosen, warning, optimal


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
        case InspectionMethod.ANGULAR_SWEEP:
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

            return Point3D(lon=lon, lat=lat, alt=alt)

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
        case InspectionMethod.ANGULAR_SWEEP:
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

            return Point3D(lon=lon, lat=lat, alt=alt)

    raise ValueError(f"unsupported inspection method: {method}")


def calculate_arc_path(
    center: Point3D,
    runway_heading: Degrees,
    glide_slope_angle: Degrees,
    config: ResolvedConfig,
    inspection_id: UUID | None,
    speed: MetersPerSecond,
) -> list[WaypointData]:
    """generate angular sweep arc path on the approach side of the PAPI."""
    density = config.measurement_density
    radius = config.horizontal_distance or MIN_ARC_RADIUS
    half_sweep = DEFAULT_SWEEP_ANGLE if config.sweep_angle is None else config.sweep_angle
    glide_height = radius * math.tan(math.radians(glide_slope_angle))
    arc_alt = center.alt + glide_height + config.altitude_offset

    # arc centered on approach heading (facing PAPI front)
    approach = _opposite_bearing(runway_heading)

    waypoints = []
    for i in range(density):
        # interpolate angle from -sweep to +sweep in density steps
        if density > 1:
            sweep_offset = -half_sweep + (2 * half_sweep / (density - 1)) * i
        else:
            # single measurement on approach centerline
            sweep_offset = 0.0

        angle = approach + sweep_offset
        lon, lat = point_at_distance(center.lon, center.lat, angle, radius)
        heading_to_center = bearing_between(lon, lat, center.lon, center.lat)

        # gimbal pitch = elevation angle from drone to LHA center
        pitch = elevation_angle(lon, lat, arc_alt, center.lon, center.lat, center.alt)

        cam_action = (
            CameraAction.RECORDING
            if config.capture_mode == "VIDEO_CAPTURE"
            else CameraAction.PHOTO_CAPTURE
        )

        waypoints.append(
            WaypointData(
                lon=lon,
                lat=lat,
                alt=arc_alt,
                heading=heading_to_center,
                speed=speed,
                waypoint_type=WaypointType.MEASUREMENT,
                camera_action=cam_action,
                camera_target=center,
                inspection_id=inspection_id,
                gimbal_pitch=pitch,
            )
        )

    return waypoints


def calculate_vertical_path(
    center: Point3D,
    runway_heading: Degrees,
    config: ResolvedConfig,
    inspection_id: UUID | None,
    speed: MetersPerSecond,
    setting_angles: list[Degrees],
) -> list[WaypointData]:
    """generate vertical profile path with HOVER at transition angles."""
    density = config.measurement_density
    hover_duration = config.hover_duration
    distance = (
        config.horizontal_distance
        if config.horizontal_distance is not None
        else DEFAULT_HORIZONTAL_DISTANCE
    )

    approach_heading = _opposite_bearing(runway_heading)
    lon, lat = point_at_distance(center.lon, center.lat, approach_heading, distance)
    heading_to_center = bearing_between(lon, lat, center.lon, center.lat)

    max_elev = _vertical_profile_max_elevation(distance, config)

    waypoints = []
    for i in range(density):
        # interpolate elevation from min to max in density steps
        if density > 1:
            elevation = (
                MIN_ELEVATION_ANGLE
                + (max_elev - MIN_ELEVATION_ANGLE) / (density - 1) * i
            )
        else:
            # single measurement at midpoint elevation
            elevation = (MIN_ELEVATION_ANGLE + max_elev) / 2

        # altitude at elevation angle from center
        alt = center.alt + distance * math.tan(math.radians(elevation))
        pitch = elevation_angle(lon, lat, alt, center.lon, center.lat, center.alt)

        # hover at LHA setting angle boundaries
        is_transition = any(abs(elevation - sa) < HOVER_ANGLE_TOLERANCE for sa in setting_angles)
        wp_type = WaypointType.HOVER if is_transition else WaypointType.MEASUREMENT
        wp_hover = hover_duration if is_transition else None

        cam_action = (
            CameraAction.RECORDING
            if config.capture_mode == "VIDEO_CAPTURE"
            else CameraAction.PHOTO_CAPTURE
        )

        waypoints.append(
            WaypointData(
                lon=lon,
                lat=lat,
                alt=alt,
                heading=heading_to_center,
                speed=speed,
                waypoint_type=wp_type,
                camera_action=cam_action,
                camera_target=center,
                inspection_id=inspection_id,
                hover_duration=wp_hover,
                gimbal_pitch=pitch,
            )
        )

    return waypoints


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


def calculate_fly_over_path(
    lha_positions: list[Point3D],
    config: ResolvedConfig,
    inspection_id: UUID | None,
    speed: MetersPerSecond,
) -> list[WaypointData]:
    """generate fly-over path: drone flies directly over a row of lights end-to-end."""
    if len(lha_positions) < 2:
        raise ValueError("fly-over requires at least two LHA positions")

    height = (
        config.height_above_lights
        if config.height_above_lights is not None
        else DEFAULT_FLY_OVER_HEIGHT
    )
    gimbal = (
        config.camera_gimbal_angle
        if config.camera_gimbal_angle is not None
        else DEFAULT_FLY_OVER_GIMBAL
    )

    first = lha_positions[0]
    last = lha_positions[-1]
    heading = bearing_between(first.lon, first.lat, last.lon, last.lat)

    cam_action = (
        CameraAction.RECORDING
        if config.capture_mode == "VIDEO_CAPTURE"
        else CameraAction.PHOTO_CAPTURE
    )

    waypoints = []
    for lha in lha_positions:
        waypoints.append(
            WaypointData(
                lon=lha.lon,
                lat=lha.lat,
                alt=lha.alt + height,
                heading=heading,
                speed=speed,
                waypoint_type=WaypointType.MEASUREMENT,
                camera_action=cam_action,
                camera_target=lha,
                inspection_id=inspection_id,
                gimbal_pitch=gimbal,
            )
        )

    return waypoints


def calculate_parallel_side_sweep_path(
    lha_positions: list[Point3D],
    runway_center: Point3D,
    config: ResolvedConfig,
    inspection_id: UUID | None,
    speed: MetersPerSecond,
    elevation_provider=None,
) -> list[WaypointData]:
    """generate parallel side-sweep path offset perpendicular from a row of lights.

    offset direction is perpendicular to first->last line, AWAY from the runway
    centerline. each waypoint is laterally offset and elevated above its LHA.
    """
    if len(lha_positions) < 2:
        raise ValueError("parallel-side-sweep requires at least two LHA positions")

    offset = config.lateral_offset if config.lateral_offset is not None else DEFAULT_PARALLEL_OFFSET
    height = (
        config.height_above_lights
        if config.height_above_lights is not None
        else DEFAULT_PARALLEL_HEIGHT
    )

    first = lha_positions[0]
    last = lha_positions[-1]
    row_heading = bearing_between(first.lon, first.lat, last.lon, last.lat)

    # two perpendicular candidates; pick the one farther from runway centerline
    perp_a = (row_heading + 90) % 360
    perp_b = (row_heading - 90 + 360) % 360
    row_center_lon = (first.lon + last.lon) / 2
    row_center_lat = (first.lat + last.lat) / 2
    a_lon, a_lat = point_at_distance(row_center_lon, row_center_lat, perp_a, offset)
    b_lon, b_lat = point_at_distance(row_center_lon, row_center_lat, perp_b, offset)

    dist_a = distance_between(a_lon, a_lat, runway_center.lon, runway_center.lat)
    dist_b = distance_between(b_lon, b_lat, runway_center.lon, runway_center.lat)
    perp = perp_a if dist_a >= dist_b else perp_b

    # default gimbal angle aims at lights: atan(height / offset) downward
    if config.camera_gimbal_angle is not None:
        gimbal = config.camera_gimbal_angle
    else:
        gimbal = -math.degrees(math.atan2(height, max(offset, 0.01)))

    cam_action = (
        CameraAction.RECORDING
        if config.capture_mode == "VIDEO_CAPTURE"
        else CameraAction.PHOTO_CAPTURE
    )

    # precompute offset positions
    offset_positions: list[tuple[float, float]] = [
        point_at_distance(lha.lon, lha.lat, perp, offset) for lha in lha_positions
    ]

    # terrain correction: waypoints sit laterally away from LHAs, where ground
    # elevation may differ from the LHA's own ground. lift waypoints by the
    # delta so clearance above terrain at the offset matches the intended height.
    terrain_deltas: list[float] = [0.0] * len(lha_positions)
    if elevation_provider is not None:
        lha_pts = [(lha.lat, lha.lon) for lha in lha_positions]
        offset_pts = [(lat, lon) for (lon, lat) in offset_positions]
        batch = elevation_provider.get_elevations_batch(lha_pts + offset_pts)
        if len(batch) == 2 * len(lha_positions):
            lha_elevs = batch[: len(lha_positions)]
            off_elevs = batch[len(lha_positions) :]
            terrain_deltas = [off - lha_e for off, lha_e in zip(off_elevs, lha_elevs)]

    waypoints = []
    for lha, (lon, lat), delta in zip(lha_positions, offset_positions, terrain_deltas):
        waypoints.append(
            WaypointData(
                lon=lon,
                lat=lat,
                alt=lha.alt + height + delta,
                heading=row_heading,
                speed=speed,
                waypoint_type=WaypointType.MEASUREMENT,
                camera_action=cam_action,
                camera_target=lha,
                inspection_id=inspection_id,
                gimbal_pitch=gimbal,
            )
        )

    return waypoints


def calculate_hover_point_lock_path(
    target_lha: Point3D,
    agl_type: str,
    runway_heading: Degrees,
    config: ResolvedConfig,
    inspection_id: UUID | None,
    speed: MetersPerSecond,
) -> list[WaypointData]:
    """generate hover-point-lock path at a single LHA.

    places the drone at a standoff distance on the approach side (toward runway
    centerline from the LHA), elevated above the LHA ground, and hovers to
    capture. runway_heading is the runway's own heading; approach = +180.
    """
    default_distance = (
        DEFAULT_HOVER_DISTANCE_PAPI if agl_type == "PAPI" else DEFAULT_HOVER_DISTANCE_RUNWAY
    )
    distance = (
        config.distance_from_lha if config.distance_from_lha is not None else default_distance
    )
    height = (
        config.height_above_lha if config.height_above_lha is not None else DEFAULT_HOVER_HEIGHT
    )
    hover_dur = (
        config.hover_duration if config.hover_duration is not None else DEFAULT_HOVER_DURATION
    )

    # resolve the bearing from the LHA to the drone's hover position.
    # reference "COMPASS": operator value is an absolute compass bearing.
    # reference "RUNWAY" (default): operator value is relative to the runway
    # heading of the AGL hosting the selected LHA (0 = along runway heading).
    # when no operator bearing is set, fall back to the legacy approach-side
    # (opposite of runway heading) so existing inspections are unaffected.
    if config.hover_bearing is not None:
        if (config.hover_bearing_reference or "RUNWAY").upper() == "COMPASS":
            bearing_from_lha = config.hover_bearing % 360
        else:
            # RUNWAY reference: 0 = approach side (opposite of runway heading)
            bearing_from_lha = (_opposite_bearing(runway_heading) + config.hover_bearing) % 360
    else:
        bearing_from_lha = _opposite_bearing(runway_heading)

    lon, lat = point_at_distance(target_lha.lon, target_lha.lat, bearing_from_lha, distance)
    alt = target_lha.alt + height
    heading_to_lha = bearing_between(lon, lat, target_lha.lon, target_lha.lat)

    # default gimbal: look downward at LHA
    if config.camera_gimbal_angle is not None:
        gimbal = config.camera_gimbal_angle
    else:
        gimbal = elevation_angle(lon, lat, alt, target_lha.lon, target_lha.lat, target_lha.alt)

    cam_action = (
        CameraAction.RECORDING
        if config.capture_mode == "VIDEO_CAPTURE"
        else CameraAction.PHOTO_CAPTURE
    )

    return [
        WaypointData(
            lon=lon,
            lat=lat,
            alt=alt,
            heading=heading_to_lha,
            speed=speed,
            waypoint_type=WaypointType.HOVER,
            camera_action=cam_action,
            camera_target=target_lha,
            inspection_id=inspection_id,
            hover_duration=hover_dur,
            gimbal_pitch=gimbal,
        )
    ]


def compute_measurement_trajectory(
    inspection,
    config: ResolvedConfig,
    center: Point3D,
    runway_heading: Degrees,
    glide_slope: Degrees,
    speed: MetersPerSecond,
    setting_angles: list[Degrees],
    elevation_provider=None,
    ordered_lha_positions: list[Point3D] | None = None,
    target_lha_position: Point3D | None = None,
    target_agl_type: str | None = None,
    runway_center: Point3D | None = None,
) -> list[WaypointData]:
    """dispatch to the path computation matching the inspection method."""
    if inspection.method == InspectionMethod.ANGULAR_SWEEP:
        waypoints = calculate_arc_path(
            center, runway_heading, glide_slope, config, inspection.id, speed
        )
    elif inspection.method == InspectionMethod.VERTICAL_PROFILE:
        waypoints = calculate_vertical_path(
            center, runway_heading, config, inspection.id, speed, setting_angles
        )
    elif inspection.method == InspectionMethod.FLY_OVER:
        if not ordered_lha_positions:
            raise ValueError("fly-over requires ordered LHA positions")
        waypoints = calculate_fly_over_path(ordered_lha_positions, config, inspection.id, speed)
    elif inspection.method == InspectionMethod.PARALLEL_SIDE_SWEEP:
        if not ordered_lha_positions:
            raise ValueError("parallel-side-sweep requires ordered LHA positions")
        if runway_center is None:
            raise ValueError("parallel-side-sweep requires a runway centerline reference point")
        waypoints = calculate_parallel_side_sweep_path(
            ordered_lha_positions,
            runway_center,
            config,
            inspection.id,
            speed,
            elevation_provider=elevation_provider,
        )
    elif inspection.method == InspectionMethod.HOVER_POINT_LOCK:
        if target_lha_position is None:
            raise ValueError("hover-point-lock requires a target LHA position")
        waypoints = calculate_hover_point_lock_path(
            target_lha_position,
            target_agl_type or "",
            runway_heading,
            config,
            inspection.id,
            speed,
        )
    else:
        raise ValueError(f"unsupported inspection method: {inspection.method}")

    # terrain correction before video wrapper. fly-over and hover-point-lock
    # place waypoints directly above their LHA, so lha.position.alt already
    # captures the correct ground elevation. parallel-side-sweep applies its
    # own terrain delta at the offset position inside calculate_parallel_side_sweep_path.
    if inspection.method in (InspectionMethod.ANGULAR_SWEEP, InspectionMethod.VERTICAL_PROFILE):
        _apply_terrain_delta(waypoints, center, elevation_provider)

    # video mode - wrap with recording start/stop hover waypoints
    if config.capture_mode == "VIDEO_CAPTURE":
        waypoints = _insert_video_hover_waypoints(waypoints, config)

    return waypoints
