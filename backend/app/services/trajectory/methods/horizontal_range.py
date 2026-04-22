import math
from uuid import UUID

from app.models.enums import CameraAction, WaypointType
from app.utils.geo import bearing_between, elevation_angle, point_at_distance

from ..config_resolver import _resolve_measurement_speed
from ..helpers import _opposite_bearing
from ..types import (
    DEFAULT_SWEEP_ANGLE,
    MIN_ARC_RADIUS,
    Degrees,
    MetersPerSecond,
    Point3D,
    ResolvedConfig,
    WaypointData,
)


def calculate_arc_path(
    center: Point3D,
    runway_heading: Degrees,
    glide_slope_angle: Degrees,
    config: ResolvedConfig,
    inspection_id: UUID | None,
    speed: MetersPerSecond,
) -> list[WaypointData]:
    """generate horizontal range arc path on the approach side of the PAPI."""
    density = config.measurement_density
    radius = config.horizontal_distance or MIN_ARC_RADIUS
    half_sweep = DEFAULT_SWEEP_ANGLE if config.sweep_angle is None else config.sweep_angle
    glide_height = radius * math.tan(math.radians(glide_slope_angle))
    arc_alt = center.alt + glide_height + config.altitude_offset

    # arc centered on approach heading (facing PAPI front)
    approach = _opposite_bearing(runway_heading)

    measurement_speed = _resolve_measurement_speed(config, speed)

    waypoints = []
    for i in range(density):
        # interpolate angle from -sweep to +sweep, flipping sign when reversed
        if density > 1:
            natural = -half_sweep + (2 * half_sweep / (density - 1)) * i
            sweep_offset = -natural if config.direction_reversed else natural
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
                speed=measurement_speed,
                waypoint_type=WaypointType.MEASUREMENT,
                camera_action=cam_action,
                camera_target=center,
                inspection_id=inspection_id,
                gimbal_pitch=pitch,
            )
        )

    return waypoints
