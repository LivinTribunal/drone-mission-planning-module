"""segment-intersection primitives shared by pathfinding search and validation."""

from __future__ import annotations

from shapely.geometry import LineString, Point, Polygon

from ..types import LocalObstacle, Meters


def check_obstacle(
    wp_x: float,
    wp_y: float,
    wp_alt: float,
    obstacle: LocalObstacle,
    buffer_distance: Meters = 0.0,
) -> bool:
    """check if waypoint is inside an obstacle's buffered boundary below its height."""
    buf = buffer_distance if buffer_distance > 0 else obstacle.buffer_distance
    poly = obstacle.polygon.buffer(buf) if buf > 0 else obstacle.polygon
    if not poly.contains(Point(wp_x, wp_y)):
        return False
    obs_top = obstacle.base_alt + obstacle.height
    return wp_alt >= obstacle.base_alt and wp_alt <= obs_top


def segments_intersect_obstacle(
    from_x: float,
    from_y: float,
    to_x: float,
    to_y: float,
    obstacle: LocalObstacle,
    buffer_distance: Meters = 0.0,
) -> bool:
    """check if a line segment intersects an obstacle's buffered 2D boundary."""
    buf = buffer_distance if buffer_distance > 0 else obstacle.buffer_distance
    poly = obstacle.polygon.buffer(buf) if buf > 0 else obstacle.polygon
    line = LineString([(from_x, from_y), (to_x, to_y)])
    return line.intersects(poly)


def segments_intersect_zone(
    from_x: float,
    from_y: float,
    to_x: float,
    to_y: float,
    zone_polygon: Polygon,
) -> bool:
    """check if a line segment intersects a safety zone's 2D footprint."""
    line = LineString([(from_x, from_y), (to_x, to_y)])
    return line.intersects(zone_polygon)


def segment_runway_crossing_length(
    from_x: float,
    from_y: float,
    to_x: float,
    to_y: float,
    surface_polygon,
) -> float:
    """length in meters of segment inside a runway's buffered area.

    uses pre-built Shapely polygon (buffered centerline). returns 0 if no crossing.
    """
    line = LineString([(from_x, from_y), (to_x, to_y)])
    if not line.intersects(surface_polygon):
        return 0.0
    intersection = line.intersection(surface_polygon)
    return intersection.length
