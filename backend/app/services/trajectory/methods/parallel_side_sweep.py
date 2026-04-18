import math
from uuid import UUID

from app.models.enums import CameraAction, WaypointType
from app.utils.geo import bearing_between, distance_between, point_at_distance

from ..config_resolver import _resolve_measurement_speed
from ..types import (
    DEFAULT_PARALLEL_HEIGHT,
    DEFAULT_PARALLEL_OFFSET,
    MetersPerSecond,
    Point3D,
    ResolvedConfig,
    WaypointData,
)


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

    measurement_speed = _resolve_measurement_speed(config, speed)

    waypoints = []
    for lha, (lon, lat), delta in zip(lha_positions, offset_positions, terrain_deltas):
        waypoints.append(
            WaypointData(
                lon=lon,
                lat=lat,
                alt=lha.alt + height + delta + config.altitude_offset,
                heading=row_heading,
                speed=measurement_speed,
                waypoint_type=WaypointType.MEASUREMENT,
                camera_action=cam_action,
                camera_target=lha,
                inspection_id=inspection_id,
                gimbal_pitch=gimbal,
            )
        )

    return waypoints
