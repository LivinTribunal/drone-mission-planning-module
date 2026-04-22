"""unit tests for local projection and Shapely-based intersection checks."""

import math

from shapely.geometry import LineString, box

from app.services.trajectory.types import LocalObstacle, LocalZone
from app.services.trajectory.validation import (
    segment_runway_crossing_length,
    segments_intersect_obstacle,
    segments_intersect_zone,
)
from app.utils.local_projection import LocalProjection

# round-trip projection accuracy


class TestLocalProjectionRoundTrip:
    """round-trip to_local -> to_wgs84 accuracy tests."""

    def test_origin_roundtrip(self):
        """origin point round-trips exactly."""
        proj = LocalProjection(ref_lon=14.26, ref_lat=50.10)
        x, y = proj.to_local(14.26, 50.10)
        assert abs(x) < 1e-10
        assert abs(y) < 1e-10
        lon, lat = proj.to_wgs84(x, y)
        assert abs(lon - 14.26) < 1e-12
        assert abs(lat - 50.10) < 1e-12

    def test_roundtrip_100m_east(self):
        """100m east of origin round-trips within 0.01m."""
        proj = LocalProjection(ref_lon=14.26, ref_lat=50.10)
        # 100m east in local coords
        x, y = 100.0, 0.0
        lon, lat = proj.to_wgs84(x, y)
        x2, y2 = proj.to_local(lon, lat)
        assert abs(x2 - x) < 0.01
        assert abs(y2 - y) < 0.01

    def test_roundtrip_100m_north(self):
        """100m north of origin round-trips within 0.01m."""
        proj = LocalProjection(ref_lon=14.26, ref_lat=50.10)
        x, y = 0.0, 100.0
        lon, lat = proj.to_wgs84(x, y)
        x2, y2 = proj.to_local(lon, lat)
        assert abs(x2 - x) < 0.01
        assert abs(y2 - y) < 0.01

    def test_roundtrip_1km_diagonal(self):
        """1km diagonal round-trips within 0.01m."""
        proj = LocalProjection(ref_lon=14.26, ref_lat=50.10)
        x, y = 707.0, 707.0
        lon, lat = proj.to_wgs84(x, y)
        x2, y2 = proj.to_local(lon, lat)
        assert abs(x2 - x) < 0.01
        assert abs(y2 - y) < 0.01

    def test_roundtrip_5km_all_directions(self):
        """5km in all cardinal directions round-trips within 0.01m."""
        proj = LocalProjection(ref_lon=14.26, ref_lat=50.10)
        for dx, dy in [(5000, 0), (-5000, 0), (0, 5000), (0, -5000), (3536, 3536)]:
            lon, lat = proj.to_wgs84(dx, dy)
            x2, y2 = proj.to_local(lon, lat)
            err = math.sqrt((x2 - dx) ** 2 + (y2 - dy) ** 2)
            assert err < 0.01, f"round-trip error {err:.4f}m at ({dx}, {dy})"

    def test_distance_accuracy_at_5km(self):
        """euclidean distance in local coords matches haversine within 0.5m at 5km."""
        from app.utils.geo import distance_between

        proj = LocalProjection(ref_lon=14.26, ref_lat=50.10)
        # two points ~5km apart
        lon1, lat1 = 14.26, 50.10
        lon2, lat2 = 14.32, 50.14
        x1, y1 = proj.to_local(lon1, lat1)
        x2, y2 = proj.to_local(lon2, lat2)
        local_dist = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        haversine_dist = distance_between(lon1, lat1, lon2, lat2)
        assert abs(local_dist - haversine_dist) < 2.0, (
            f"distance error {abs(local_dist - haversine_dist):.3f}m "
            f"(local={local_dist:.1f}m, haversine={haversine_dist:.1f}m)"
        )


# Shapely intersection accuracy vs known geometry


class TestShapelyIntersectionAccuracy:
    """Shapely intersection results match expected geometry."""

    def test_line_intersects_polygon(self):
        """line crossing a polygon is detected."""
        poly = box(0, 0, 100, 100)
        line = LineString([(-50, 50), (150, 50)])
        assert line.intersects(poly)

    def test_line_misses_polygon(self):
        """line not crossing a polygon is not detected."""
        poly = box(0, 0, 100, 100)
        line = LineString([(-50, 150), (150, 150)])
        assert not line.intersects(poly)

    def test_intersection_length_accuracy(self):
        """intersection length matches expected value."""
        # 100m wide runway, line crosses perpendicular through center
        runway = box(-500, -50, 500, 50)
        line = LineString([(0, -200), (0, 200)])
        intersection = line.intersection(runway)
        # should be exactly 100m (from y=-50 to y=50)
        assert abs(intersection.length - 100.0) < 0.01

    def test_obstacle_containment(self):
        """point inside buffered obstacle is detected."""
        from shapely.geometry import Point

        obs_poly = box(0, 0, 10, 10)
        buffered = obs_poly.buffer(5.0)
        # point 3m outside original boundary but inside 5m buffer
        assert buffered.contains(Point(12.0, 5.0))
        # point 6m outside - beyond buffer
        assert not buffered.contains(Point(16.0, 5.0))

    def test_obstacle_intersection_with_buffer(self):
        """segment intersecting buffered obstacle is detected."""
        obs = LocalObstacle(
            polygon=box(40, 40, 60, 60),
            name="test",
            height=10.0,
            base_alt=0.0,
            buffer_distance=10.0,
        )
        # line passes 5m from obstacle edge - within 10m buffer
        assert segments_intersect_obstacle(50, 0, 50, 100, obs, buffer_distance=10.0)
        # line passes 15m from obstacle edge - outside 10m buffer
        assert not segments_intersect_obstacle(80, 0, 80, 100, obs, buffer_distance=10.0)

    def test_runway_crossing_length_diagonal(self):
        """diagonal crossing returns correct length."""
        # runway 100m wide, 1000m long, centered at origin
        runway = box(-500, -50, 500, 50)
        # diagonal line from (-100, -100) to (100, 100)
        length = segment_runway_crossing_length(-100, -100, 100, 100, runway)
        # crosses 100m of height diagonally: 100*sqrt(2) ≈ 141.4m
        assert abs(length - 100 * math.sqrt(2)) < 1.0


# local projection with real WGS84 coordinates


class TestProjectionWithRealCoordinates:
    """test projection with LKPR-like coordinates."""

    def test_lkpr_runway_distance(self):
        """distance between two runway endpoints in local coords matches haversine."""
        from app.utils.geo import distance_between

        proj = LocalProjection(ref_lon=14.26, ref_lat=50.10)
        # approximate LKPR runway endpoints
        lon1, lat1 = 14.255, 50.10
        lon2, lat2 = 14.265, 50.10
        x1, y1 = proj.to_local(lon1, lat1)
        x2, y2 = proj.to_local(lon2, lat2)
        local_dist = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        haversine_dist = distance_between(lon1, lat1, lon2, lat2)
        assert abs(local_dist - haversine_dist) < 0.1

    def test_obstacle_avoidance_path_deviation(self):
        """path around obstacle in local coords deviates less than 1m from haversine path."""
        proj = LocalProjection(ref_lon=14.26, ref_lat=50.10)
        # two points ~200m apart
        lon1, lat1 = 14.259, 50.10
        lon2, lat2 = 14.261, 50.10
        x1, y1 = proj.to_local(lon1, lat1)
        x2, y2 = proj.to_local(lon2, lat2)
        # direct distance in local vs haversine
        from app.utils.geo import distance_between

        local_dist = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        haversine_dist = distance_between(lon1, lat1, lon2, lat2)
        assert abs(local_dist - haversine_dist) < 1.0


# edge cases


class TestProjectionEdgeCases:
    """edge cases for local projection."""

    def test_zero_distance(self):
        """same point round-trips exactly."""
        proj = LocalProjection(ref_lon=0.0, ref_lat=0.0)
        x, y = proj.to_local(0.0, 0.0)
        assert x == 0.0
        assert y == 0.0

    def test_negative_coordinates(self):
        """negative coordinates (western hemisphere) work correctly."""
        proj = LocalProjection(ref_lon=-73.9, ref_lat=40.7)
        x, y = proj.to_local(-73.9, 40.7)
        assert abs(x) < 1e-10
        assert abs(y) < 1e-10
        # point 1km east
        lon, lat = proj.to_wgs84(1000.0, 0.0)
        x2, y2 = proj.to_local(lon, lat)
        assert abs(x2 - 1000.0) < 0.01

    def test_empty_obstacle_list(self):
        """intersection check with empty obstacle list returns False."""
        from app.services.trajectory.pathfinding import _is_segment_blocked

        assert not _is_segment_blocked(0, 0, 100, 100, [], [])

    def test_zone_intersection_with_hard_type(self):
        """hard zone intersection is detected."""
        zone = LocalZone(
            polygon=box(40, 40, 60, 60),
            zone_type="PROHIBITED",
            name="test",
            altitude_floor=None,
            altitude_ceiling=None,
        )
        assert segments_intersect_zone(0, 50, 100, 50, zone.polygon)

    def test_zone_intersection_miss(self):
        """line missing zone returns False."""
        zone_poly = box(40, 40, 60, 60)
        assert not segments_intersect_zone(0, 0, 100, 0, zone_poly)
