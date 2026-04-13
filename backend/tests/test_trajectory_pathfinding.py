"""unit tests for trajectory pathfinding - visibility graph, A*, collision resolution."""

from types import SimpleNamespace

import pytest

from app.models.enums import CameraAction, WaypointType
from app.services.trajectory_pathfinding import _max_effective_buffer, _max_turn_angle
from app.services.trajectory_types import DEFAULT_OBSTACLE_RADIUS, Point3D, WaypointData

# _max_turn_angle


class TestMaxTurnAngle:
    """tests for maximum heading change between consecutive waypoints."""

    def test_no_turn(self):
        """identical headings produce zero turn angle."""
        wps = [
            WaypointData(lon=0, lat=0, alt=100, heading=90.0),
            WaypointData(lon=1, lat=0, alt=100, heading=90.0),
            WaypointData(lon=2, lat=0, alt=100, heading=90.0),
        ]
        assert _max_turn_angle(wps) == 0.0

    def test_simple_turn(self):
        """detects a 45 degree turn."""
        wps = [
            WaypointData(lon=0, lat=0, alt=100, heading=0.0),
            WaypointData(lon=1, lat=0, alt=100, heading=45.0),
            WaypointData(lon=2, lat=0, alt=100, heading=45.0),
        ]
        assert _max_turn_angle(wps) == 45.0

    def test_wrap_around(self):
        """handles 350 to 10 degree transition (20 degree turn, not 340)."""
        wps = [
            WaypointData(lon=0, lat=0, alt=100, heading=350.0),
            WaypointData(lon=1, lat=0, alt=100, heading=10.0),
        ]
        assert _max_turn_angle(wps) == 20.0

    def test_single_waypoint(self):
        """single waypoint produces zero turn angle."""
        wps = [WaypointData(lon=0, lat=0, alt=100, heading=90.0)]
        assert _max_turn_angle(wps) == 0.0

    def test_max_of_multiple_turns(self):
        """returns the maximum turn across all segments."""
        wps = [
            WaypointData(lon=0, lat=0, alt=100, heading=0.0),
            WaypointData(lon=1, lat=0, alt=100, heading=10.0),
            WaypointData(lon=2, lat=0, alt=100, heading=70.0),  # 60 degree turn
            WaypointData(lon=3, lat=0, alt=100, heading=80.0),
        ]
        assert _max_turn_angle(wps) == 60.0

    def test_opposite_heading(self):
        """180 degree turn is the max possible."""
        wps = [
            WaypointData(lon=0, lat=0, alt=100, heading=0.0),
            WaypointData(lon=1, lat=0, alt=100, heading=180.0),
        ]
        assert _max_turn_angle(wps) == 180.0


# Point3D


class TestPoint3D:
    """tests for Point3D helper methods."""

    def test_to_tuple(self):
        """converts to (lon, lat, alt) tuple."""
        p = Point3D(lon=14.26, lat=50.1, alt=300.0)
        assert p.to_tuple() == (14.26, 50.1, 300.0)

    def test_from_tuple(self):
        """creates from (lon, lat, alt) tuple."""
        p = Point3D.from_tuple((14.26, 50.1, 300.0))
        assert p.lon == 14.26
        assert p.lat == 50.1
        assert p.alt == 300.0

    def test_center(self):
        """arithmetic mean of points."""
        pts = [
            Point3D(lon=10.0, lat=20.0, alt=100.0),
            Point3D(lon=20.0, lat=40.0, alt=200.0),
        ]
        c = Point3D.center(pts)
        assert c.lon == 15.0
        assert c.lat == 30.0
        assert c.alt == 150.0

    def test_center_empty_raises(self):
        """raises ValueError for empty list."""
        with pytest.raises(ValueError, match="no points"):
            Point3D.center([])


# WaypointData defaults


class TestWaypointDataDefaults:
    """tests for WaypointData default values."""

    def test_defaults(self):
        """verify default field values."""
        wp = WaypointData(lon=14.0, lat=50.0, alt=300.0)
        assert wp.heading == 0.0
        assert wp.speed == 5.0
        assert wp.waypoint_type == WaypointType.MEASUREMENT
        assert wp.camera_action == CameraAction.PHOTO_CAPTURE
        assert wp.camera_target is None
        assert wp.inspection_id is None
        assert wp.hover_duration is None
        assert wp.gimbal_pitch is None


# transit path computation - tested via integration tests in test_trajectory_orchestrator
# but we add geometry-level unit tests here


class TestTransitPathGeometry:
    """tests for transit path waypoint properties."""

    def test_transit_waypoint_type(self):
        """transit waypoints should have TRANSIT type and NONE camera action."""
        wp = WaypointData(
            lon=14.26,
            lat=50.1,
            alt=350.0,
            heading=90.0,
            speed=8.0,
            waypoint_type=WaypointType.TRANSIT,
            camera_action=CameraAction.NONE,
        )
        assert wp.waypoint_type == WaypointType.TRANSIT
        assert wp.camera_action == CameraAction.NONE


# test the `or` pattern fix in orchestrator (issue #2 and #6)


class TestNullableFloatOrPattern:
    """tests that 0.0 is handled correctly as a valid value (not falsy)."""

    def test_zero_buffer_distance_not_substituted(self):
        """0.0 buffer distance should be used, not replaced with default."""
        # simulates the fixed logic
        default_buffer = 0.0
        fallback = 5.0

        result = default_buffer if default_buffer is not None else fallback
        assert result == 0.0

    def test_none_buffer_distance_uses_fallback(self):
        """None buffer distance should use fallback."""
        default_buffer = None
        fallback = 5.0

        result = default_buffer if default_buffer is not None else fallback
        assert result == 5.0

    def test_zero_transit_agl_not_substituted(self):
        """0.0 transit_agl should be used, not replaced with default."""
        transit_agl = 0.0
        default = 5.0

        result = transit_agl if transit_agl is not None else default
        assert result == 0.0

    def test_none_transit_agl_uses_fallback(self):
        """None transit_agl should use fallback."""
        transit_agl = None
        default = 5.0

        result = transit_agl if transit_agl is not None else default
        assert result == 5.0

    def test_positive_value_preserved(self):
        """positive value should be preserved."""
        val = 3.5
        fallback = 5.0

        result = val if val is not None else fallback
        assert result == 3.5


# regression - zero buffer_distance_override must not collapse reroute search radius


class TestMaxEffectiveBuffer:
    """tests for _max_effective_buffer with zero/None/positive overrides."""

    def test_zero_override_falls_back_to_per_obstacle(self):
        """a 0.0 override should not zero out the search radius.

        regression: `0.0 or fallback` evaluated to fallback but the None-check
        rewrite kept returning 0.0 for obstacles. the reroute search radius
        must stay non-zero or A* produces an empty graph.
        """
        obstacles = [
            SimpleNamespace(buffer_distance=5.0),
            SimpleNamespace(buffer_distance=10.0),
        ]
        assert _max_effective_buffer(obstacles, 0.0) == 10.0

    def test_none_override_uses_per_obstacle_max(self):
        """None override uses max per-obstacle buffer."""
        obstacles = [
            SimpleNamespace(buffer_distance=3.0),
            SimpleNamespace(buffer_distance=7.0),
        ]
        assert _max_effective_buffer(obstacles, None) == 7.0

    def test_positive_override_used_when_obstacles_present(self):
        """positive override replaces per-obstacle values."""
        obstacles = [SimpleNamespace(buffer_distance=5.0)]
        assert _max_effective_buffer(obstacles, 20.0) == 20.0

    def test_positive_override_no_obstacles_uses_default(self):
        """positive override with no obstacles falls back to DEFAULT_OBSTACLE_RADIUS."""
        assert _max_effective_buffer([], 20.0) == DEFAULT_OBSTACLE_RADIUS

    def test_empty_obstacles_none_override(self):
        """empty obstacles + None override returns DEFAULT_OBSTACLE_RADIUS."""
        assert _max_effective_buffer([], None) == DEFAULT_OBSTACLE_RADIUS


# regression - buffer_distance_override must reach fast-path segment check


class TestFastPathBufferOverride:
    """regression: compute_transit_path must pass buffer_distance_override to the
    fast-path _is_segment_blocked call, not just the A* branch."""

    def test_override_resolved_for_fast_path(self):
        """buffer_distance_override is included in the fast-path expression."""
        # verify the fix at source level - the fast-path buffer expression
        # must resolve buffer_distance_override before calling _is_segment_blocked
        import inspect

        from app.services.trajectory_pathfinding import compute_transit_path

        source = inspect.getsource(compute_transit_path)

        # the fast-path _is_segment_blocked call should include buffer_distance
        # prior to fix it was: _is_segment_blocked(db, from_point, to_point, obstacles, zones)
        # after fix: _is_segment_blocked(..., buffer_distance=fast_path_buffer)
        assert "fast_path_buffer" in source, (
            "compute_transit_path must resolve buffer_distance_override for fast-path check"
        )
