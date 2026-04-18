from uuid import UUID

from app.models.enums import CameraAction, WaypointType
from app.utils.geo import bearing_between

from ..config_resolver import _resolve_measurement_speed
from ..types import (
    DEFAULT_FLY_OVER_GIMBAL,
    DEFAULT_FLY_OVER_HEIGHT,
    MetersPerSecond,
    Point3D,
    ResolvedConfig,
    WaypointData,
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

    measurement_speed = _resolve_measurement_speed(config, speed)

    waypoints = []
    for lha in lha_positions:
        waypoints.append(
            WaypointData(
                lon=lha.lon,
                lat=lha.lat,
                alt=lha.alt + height + config.altitude_offset,
                heading=heading,
                speed=measurement_speed,
                waypoint_type=WaypointType.MEASUREMENT,
                camera_action=cam_action,
                camera_target=lha,
                inspection_id=inspection_id,
                gimbal_pitch=gimbal,
            )
        )

    return waypoints
