"""meht check trajectory - single hover at the minimum eye height over threshold."""

from uuid import UUID

from app.models.enums import CameraAction, WaypointType
from app.utils.geo import bearing_between, elevation_angle

from ..types import (
    DEFAULT_MEHT_HOVER_DURATION,
    MetersPerSecond,
    Point3D,
    ResolvedConfig,
    WaypointData,
)


def calculate_meht_check_path(
    meht_point: Point3D,
    lha_center: Point3D,
    config: ResolvedConfig,
    inspection_id: UUID | None,
    speed: MetersPerSecond,
) -> list[WaypointData]:
    """generate a single hover waypoint at the MEHT position.

    the drone hovers at the meht point (above threshold at glide slope height)
    facing toward the PAPI bar, with the camera locked on the LHA center.
    per ICAO Doc 9157 P4 s8.3.43.
    """
    hover_dur = (
        config.hover_duration if config.hover_duration is not None else DEFAULT_MEHT_HOVER_DURATION
    )

    heading = bearing_between(meht_point.lon, meht_point.lat, lha_center.lon, lha_center.lat)

    if config.camera_gimbal_angle is not None:
        gimbal = config.camera_gimbal_angle
    else:
        gimbal = elevation_angle(
            meht_point.lon,
            meht_point.lat,
            meht_point.alt,
            lha_center.lon,
            lha_center.lat,
            lha_center.alt,
        )

    cam_action = (
        CameraAction.RECORDING
        if config.capture_mode == "VIDEO_CAPTURE"
        else CameraAction.PHOTO_CAPTURE
    )

    return [
        WaypointData(
            lon=meht_point.lon,
            lat=meht_point.lat,
            alt=meht_point.alt,
            heading=heading,
            speed=speed,
            waypoint_type=WaypointType.HOVER,
            camera_action=cam_action,
            camera_target=lha_center,
            inspection_id=inspection_id,
            hover_duration=hover_dur,
            gimbal_pitch=gimbal,
        )
    ]
