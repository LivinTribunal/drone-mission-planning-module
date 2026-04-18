import math
from uuid import UUID

from app.models.enums import CameraAction, WaypointType
from app.utils.geo import bearing_between, elevation_angle, point_at_distance

from ..config_resolver import _resolve_measurement_speed
from ..helpers import _opposite_bearing, _vertical_profile_max_elevation
from ..types import (
    DEFAULT_HORIZONTAL_DISTANCE,
    MIN_ELEVATION_ANGLE,
    Degrees,
    MetersPerSecond,
    Point3D,
    ResolvedConfig,
    WaypointData,
)


def calculate_vertical_path(
    center: Point3D,
    runway_heading: Degrees,
    config: ResolvedConfig,
    inspection_id: UUID | None,
    speed: MetersPerSecond,
    setting_angles: list[Degrees],
) -> list[WaypointData]:
    """generate vertical profile path as one continuous measurement pass.

    setting_angles stays in the signature for symmetry with other measurement
    paths and future density derivation; hover stops at LHA setting angles
    were removed so operators get one continuous climb.
    """
    density = config.measurement_density
    distance = (
        config.horizontal_distance
        if config.horizontal_distance is not None
        else DEFAULT_HORIZONTAL_DISTANCE
    )
    measurement_speed = _resolve_measurement_speed(config, speed)

    approach_heading = _opposite_bearing(runway_heading)
    lon, lat = point_at_distance(center.lon, center.lat, approach_heading, distance)
    heading_to_center = bearing_between(lon, lat, center.lon, center.lat)

    max_elev = _vertical_profile_max_elevation(distance, config)

    cam_action = (
        CameraAction.RECORDING
        if config.capture_mode == "VIDEO_CAPTURE"
        else CameraAction.PHOTO_CAPTURE
    )

    waypoints = []
    for i in range(density):
        # interpolate elevation from min to max in density steps
        if density > 1:
            elevation = MIN_ELEVATION_ANGLE + (max_elev - MIN_ELEVATION_ANGLE) / (density - 1) * i
        else:
            # single measurement at midpoint elevation
            elevation = (MIN_ELEVATION_ANGLE + max_elev) / 2

        alt = center.alt + distance * math.tan(math.radians(elevation)) + config.altitude_offset
        pitch = elevation_angle(lon, lat, alt, center.lon, center.lat, center.alt)

        waypoints.append(
            WaypointData(
                lon=lon,
                lat=lat,
                alt=alt,
                heading=heading_to_center,
                speed=measurement_speed,
                waypoint_type=WaypointType.MEASUREMENT,
                camera_action=cam_action,
                camera_target=center,
                inspection_id=inspection_id,
                hover_duration=None,
                gimbal_pitch=pitch,
            )
        )

    return waypoints
