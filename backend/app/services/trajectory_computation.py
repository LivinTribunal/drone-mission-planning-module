import math
from uuid import UUID

from app.models.enums import CameraAction, InspectionMethod, WaypointType
from app.models.mission import DroneProfile
from app.schemas.geometry import parse_ewkb
from app.services.trajectory_types import (
    DEFAULT_GLIDE_SLOPE,
    DEFAULT_HEADING,
    DEFAULT_HORIZONTAL_DISTANCE,
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
    center_of_points,
    elevation_angle,
    point_at_distance,
)

# config fields that can be overridden per-inspection
CONFIG_FIELDS = (
    "altitude_offset",
    "speed_override",
    "measurement_density",
    "custom_tolerances",
    "density",
    "hover_duration",
    "horizontal_distance",
    "sweep_angle",
)


def overlay_config(result: ResolvedConfig, config) -> None:
    """Overlay non-None fields from an ORM config onto resolved config."""
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


def get_lha_positions(template) -> list[Point3D]:
    """Extract 3D positions from all LHA units across template targets."""
    positions = []
    for agl in template.targets:
        for lha in agl.lhas:
            if not lha.position:
                continue
            c = parse_ewkb(lha.position.data)["coordinates"]
            positions.append(Point3D(lon=c[0], lat=c[1], alt=c[2]))

    return positions


def get_lha_setting_angles(template) -> list[Degrees]:
    """Collect and sort setting angles from all LHA units in template."""
    angles = []
    for agl in template.targets:
        for lha in agl.lhas:
            if lha.setting_angle is not None:
                angles.append(lha.setting_angle)

    return sorted(angles)


def get_glide_slope_angle(template) -> Degrees:
    """Return the first non-null glide slope angle from template targets, or default."""
    for agl in template.targets:
        if agl.glide_slope_angle is not None:
            return agl.glide_slope_angle

    return DEFAULT_GLIDE_SLOPE


def get_runway_heading(template, surfaces) -> Degrees:
    """Return the heading of the runway surface associated with the template."""
    for agl in template.targets:
        for surface in surfaces:
            if surface.id == agl.surface_id and surface.heading:
                return surface.heading

    return DEFAULT_HEADING


def compute_optimal_density(
    method: InspectionMethod,
    setting_angles: list[Degrees],
    config: ResolvedConfig,
) -> int | None:
    """Compute minimum density to capture all transition angles.

    For vertical profiles with setting angles, the step must be
    <= 2 * HOVER_ANGLE_TOLERANCE so every setting angle has at least
    one waypoint within tolerance.
    For arc sweeps, at least one point per degree of sweep.
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
    """Compute speed that ensures camera captures at least one frame per waypoint spacing.

    At speed v and frame_rate f, the camera captures every v/f meters.
    For useful measurements, capture spacing must be <= waypoint spacing,
    so: v <= waypoint_spacing * frame_rate.
    """
    if not drone or not drone.camera_frame_rate or density < 2:
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
    """Check if speed is compatible with camera frame rate."""
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
    """Verify camera field of view covers all LHA units at the given distance."""
    if not drone.sensor_fov or len(lha_positions) < MIN_LHA_FOR_FOV_CHECK:
        return None

    tuples = [p.to_tuple() for p in lha_positions]
    center = center_of_points(tuples)
    obs_lon, obs_lat = point_at_distance(center[0], center[1], approach_heading, distance)
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
    """Resolve measurement density, auto-increasing if optimal exceeds configured value.

    Returns the final density and an optional warning string if auto-increased.
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
    """Resolve measurement speed from override, optimal calculation, or default.

    Returns (final_speed, optional_warning, optimal_speed).
    """
    optimal = compute_optimal_speed(path_distance, density, drone)

    if config.speed_override is not None:
        return config.speed_override, None, optimal

    if optimal is not None:
        warning = f"speed auto-set to {optimal:.1f} m/s based on path geometry and frame rate"
        return optimal, warning, optimal

    return default_speed, None, optimal


def determine_start_position(
    center: Point3D,
    config: ResolvedConfig,
    method: InspectionMethod,
    runway_heading: Degrees,
    glide_slope: Degrees,
) -> Point3D:
    """Compute start position of inspection pass based on method and geometry."""
    # arc sweep is on the approach side (facing the PAPI front)
    approach = (runway_heading + 180) % 360

    match method:
        case InspectionMethod.ANGULAR_SWEEP:
            radius = config.horizontal_distance or MIN_ARC_RADIUS
            half_sweep = DEFAULT_SWEEP_ANGLE if config.sweep_angle is None else config.sweep_angle
            angle = approach - half_sweep
            lon, lat = point_at_distance(center.lon, center.lat, angle, radius)
            alt = center.alt + radius * math.tan(math.radians(glide_slope))

            return Point3D(lon=lon, lat=lat, alt=alt + config.altitude_offset)

        case _:
            distance = (
                config.horizontal_distance
                if config.horizontal_distance is not None
                else DEFAULT_HORIZONTAL_DISTANCE
            )
            lon, lat = point_at_distance(center.lon, center.lat, approach, distance)
            alt = center.alt + distance * math.tan(math.radians(MIN_ELEVATION_ANGLE))

            return Point3D(lon=lon, lat=lat, alt=alt)


def determine_end_position(
    center: Point3D,
    config: ResolvedConfig,
    method: InspectionMethod,
    runway_heading: Degrees,
    glide_slope: Degrees,
) -> Point3D:
    """Compute end position of inspection pass based on method and geometry."""
    approach = (runway_heading + 180) % 360

    match method:
        case InspectionMethod.ANGULAR_SWEEP:
            radius = config.horizontal_distance or MIN_ARC_RADIUS
            half_sweep = DEFAULT_SWEEP_ANGLE if config.sweep_angle is None else config.sweep_angle
            angle = approach + half_sweep
            lon, lat = point_at_distance(center.lon, center.lat, angle, radius)
            alt = center.alt + radius * math.tan(math.radians(glide_slope))

            return Point3D(lon=lon, lat=lat, alt=alt + config.altitude_offset)

        case _:
            distance = (
                config.horizontal_distance
                if config.horizontal_distance is not None
                else DEFAULT_HORIZONTAL_DISTANCE
            )
            lon, lat = point_at_distance(center.lon, center.lat, approach, distance)
            alt = center.alt + distance * math.tan(math.radians(MAX_ELEVATION_ANGLE))

            return Point3D(lon=lon, lat=lat, alt=alt)


def calculate_arc_path(
    center: Point3D,
    runway_heading: Degrees,
    glide_slope_angle: Degrees,
    config: ResolvedConfig,
    inspection_id: UUID | None,
    speed: MetersPerSecond,
) -> list[WaypointData]:
    """Generate angular sweep arc path on the approach side of the PAPI."""
    density = config.measurement_density
    radius = config.horizontal_distance or MIN_ARC_RADIUS
    half_sweep = DEFAULT_SWEEP_ANGLE if config.sweep_angle is None else config.sweep_angle
    glide_height = radius * math.tan(math.radians(glide_slope_angle))
    arc_alt = center.alt + glide_height + config.altitude_offset

    # arc centered on approach heading (facing PAPI front)
    approach = (runway_heading + 180) % 360

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

        waypoints.append(
            WaypointData(
                lon=lon,
                lat=lat,
                alt=arc_alt,
                heading=heading_to_center,
                speed=speed,
                waypoint_type=WaypointType.MEASUREMENT,
                camera_action=CameraAction.PHOTO_CAPTURE,
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
    """Generate vertical profile path with HOVER at transition angles."""
    density = config.measurement_density
    hover_duration = config.hover_duration
    distance = (
        config.horizontal_distance
        if config.horizontal_distance is not None
        else DEFAULT_HORIZONTAL_DISTANCE
    )

    approach_heading = (runway_heading + 180) % 360
    lon, lat = point_at_distance(center.lon, center.lat, approach_heading, distance)
    heading_to_center = bearing_between(lon, lat, center.lon, center.lat)

    waypoints = []
    for i in range(density):
        # interpolate elevation from min to max in density steps
        if density > 1:
            elevation = (
                MIN_ELEVATION_ANGLE
                + (MAX_ELEVATION_ANGLE - MIN_ELEVATION_ANGLE) / (density - 1) * i
            )
        else:
            # single measurement at midpoint elevation
            elevation = (MIN_ELEVATION_ANGLE + MAX_ELEVATION_ANGLE) / 2

        # altitude at elevation angle from center
        alt = center.alt + distance * math.tan(math.radians(elevation))
        pitch = elevation_angle(lon, lat, alt, center.lon, center.lat, center.alt)

        # hover at LHA setting angle boundaries
        is_transition = any(abs(elevation - sa) < HOVER_ANGLE_TOLERANCE for sa in setting_angles)
        wp_type = WaypointType.HOVER if is_transition else WaypointType.MEASUREMENT
        wp_hover = hover_duration if is_transition else None

        waypoints.append(
            WaypointData(
                lon=lon,
                lat=lat,
                alt=alt,
                heading=heading_to_center,
                speed=speed,
                waypoint_type=wp_type,
                camera_action=CameraAction.PHOTO_CAPTURE,
                camera_target=center,
                inspection_id=inspection_id,
                hover_duration=wp_hover,
                gimbal_pitch=pitch,
            )
        )

    return waypoints


def compute_measurement_trajectory(
    inspection,
    config: ResolvedConfig,
    center: Point3D,
    runway_heading: Degrees,
    glide_slope: Degrees,
    speed: MetersPerSecond,
    setting_angles: list[Degrees],
) -> list[WaypointData]:
    """Dispatch to arc or vertical path computation based on inspection method."""
    if inspection.method == InspectionMethod.ANGULAR_SWEEP:
        return calculate_arc_path(center, runway_heading, glide_slope, config, inspection.id, speed)

    if inspection.method == InspectionMethod.VERTICAL_PROFILE:
        return calculate_vertical_path(
            center, runway_heading, config, inspection.id, speed, setting_angles
        )

    raise ValueError(f"unsupported inspection method: {inspection.method}")
