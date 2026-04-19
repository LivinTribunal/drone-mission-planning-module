import math

from app.models.enums import InspectionMethod
from app.models.inspection import CONFIG_FIELDS, InspectionConfiguration
from app.models.mission import DroneProfile
from app.utils.geo import angular_span_at_distance, point_at_distance

from .types import (
    DEFAULT_SWEEP_ANGLE,
    HOVER_ANGLE_TOLERANCE,
    MAX_ELEVATION_ANGLE,
    MIN_ELEVATION_ANGLE,
    MIN_LHA_FOR_FOV_CHECK,
    SPEED_FRAMERATE_MARGIN,
    Degrees,
    Meters,
    MetersPerSecond,
    Point3D,
    ResolvedConfig,
)


def _resolve_measurement_speed(
    config: ResolvedConfig, transit_speed: MetersPerSecond
) -> MetersPerSecond:
    """pick measurement speed: override > resolved transit speed."""
    if config.measurement_speed_override is not None:
        return config.measurement_speed_override
    return transit_speed


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

        case InspectionMethod.PAPI_HORIZONTAL_RANGE:
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


def resolve_density(
    method: InspectionMethod,
    setting_angles: list[Degrees],
    config: ResolvedConfig,
) -> tuple[int, str | None]:
    """suggest optimal density without overriding user's configured value.

    returns the user's density and an optional suggestion if optimal exceeds it.
    """
    optimal = compute_optimal_density(method, setting_angles, config)
    if optimal is not None and config.measurement_density < optimal:
        suggestion = (
            f"density {config.measurement_density} may miss transition angles, "
            f"recommended: {optimal}"
        )
        return config.measurement_density, suggestion

    return config.measurement_density, None


def resolve_speed(
    path_distance: Meters,
    density: int,
    drone,
    default_speed: MetersPerSecond,
) -> tuple[MetersPerSecond, str | None, MetersPerSecond | None]:
    """resolve transit speed from optimal calculation or mission default.

    optimal speed is the max that still captures one frame per waypoint spacing,
    clamped to default_speed so measurement passes stay slow and precise.
    returns (final_speed, optional_warning, optimal_speed).
    """
    optimal = compute_optimal_speed(path_distance, density, drone)

    if optimal is not None:
        chosen = min(optimal, default_speed)
    else:
        chosen = default_speed

    # warn if operator's configured speed exceeds camera frame rate ceiling
    warning = None
    if optimal is not None and default_speed > optimal:
        warning = (
            f"speed {chosen:.1f} m/s exceeds camera frame rate ceiling "
            f"{optimal:.1f} m/s - frames may be missed"
        )

    return chosen, warning, optimal


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
    drone, lha_positions: list, distance: Meters, approach_heading: Degrees = 0.0
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
