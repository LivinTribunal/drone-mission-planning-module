from uuid import UUID

from app.models.enums import CameraAction, WaypointType
from app.utils.geo import bearing_between, elevation_angle, point_at_distance

from ..helpers import _opposite_bearing
from ..types import (
    DEFAULT_HOVER_DISTANCE_PAPI,
    DEFAULT_HOVER_DISTANCE_RUNWAY,
    DEFAULT_HOVER_DURATION,
    DEFAULT_HOVER_HEIGHT,
    Degrees,
    MetersPerSecond,
    Point3D,
    ResolvedConfig,
    WaypointData,
)


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
    alt = target_lha.alt + height + config.altitude_offset
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
