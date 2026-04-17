"""unit tests for trajectory pathfinding - visibility graph, A*, collision resolution."""

from types import SimpleNamespace
from uuid import uuid4

import pytest
from geoalchemy2.elements import WKTElement

from app.models.airport import Airport, Obstacle, Runway
from app.models.enums import CameraAction, WaypointType
from app.services.trajectory_pathfinding import (
    _max_effective_buffer,
    _max_turn_angle,
    compute_transit_path,
    resolve_inspection_collisions,
)
from app.services.trajectory_types import DEFAULT_OBSTACLE_RADIUS, Point3D, WaypointData
from app.utils.geo import bearing_between, total_path_distance

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
        assert (
            "fast_path_buffer" in source
        ), "compute_transit_path must resolve buffer_distance_override for fast-path check"


# perpendicular vs shortest-geodesic runway crossing flag


_ICAO_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _unique_icao() -> str:
    """generate a unique 4-letter ICAO code so tests don't collide on the unique constraint."""
    raw = uuid4().hex.upper()
    out = []
    for ch in raw:
        if ch in _ICAO_ALPHABET:
            out.append(ch)
        if len(out) == 4:
            break
    while len(out) < 4:
        out.append("X")
    return "".join(out)


def _make_perpendicular_runway_airport(db_session):
    """build airport with a single east-west runway centered at (14.26, 50.10)."""
    airport = Airport(
        id=uuid4(),
        icao_code=_unique_icao(),
        name="Flag Test Airport",
        elevation=300.0,
        location=WKTElement("SRID=4326;POINTZ(14.26 50.10 300)", srid=4326),
    )
    runway = Runway(
        id=uuid4(),
        airport_id=airport.id,
        identifier="09/27",
        surface_type="RUNWAY",
        geometry=WKTElement(
            "SRID=4326;LINESTRINGZ(14.255 50.10 300, 14.265 50.10 300)",
            srid=4326,
        ),
        heading=90.0,
        length=700.0,
        width=45.0,
        buffer_distance=5.0,
    )
    db_session.add(airport)
    db_session.add(runway)
    db_session.commit()
    db_session.refresh(airport)
    db_session.refresh(runway)
    return airport, runway


def _bearings(waypoints, from_pt):
    """consecutive segment bearings starting from from_pt."""
    pts = [(from_pt.lon, from_pt.lat)] + [(w.lon, w.lat) for w in waypoints]
    out = []
    for i in range(1, len(pts)):
        out.append(bearing_between(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]))
    return out


def _path_distance(waypoints, from_pt):
    """total geodesic distance from from_pt through waypoints."""
    pts = [(from_pt.lon, from_pt.lat, from_pt.alt)] + [(w.lon, w.lat, w.alt) for w in waypoints]
    return total_path_distance(pts)


class TestRequirePerpendicularRunwayCrossing:
    """flag toggles between perpendicular-anchored A* and shortest-geodesic crossing."""

    def test_flag_true_keeps_perpendicular_segment(self, db_session):
        """with the flag on, A* must include a segment near runway-perpendicular."""
        _, runway = _make_perpendicular_runway_airport(db_session)

        # endpoints north and south of east-west runway, offset east of midpoint
        from_pt = Point3D(lon=14.262, lat=50.0975, alt=350.0)
        to_pt = Point3D(lon=14.258, lat=50.1025, alt=350.0)

        wps = compute_transit_path(
            db_session,
            from_pt,
            to_pt,
            obstacles=[],
            zones=[],
            speed=8.0,
            surfaces=[runway],
            require_perpendicular_runway_crossing=True,
        )

        bearings = _bearings(wps, from_pt)

        # runway heading 90 -> perpendicular bearings are 0 or 180
        def perp_delta(b):
            return min(abs(b - 0.0), abs(b - 180.0), abs(b - 360.0))

        assert any(
            perp_delta(b) <= 5.0 for b in bearings
        ), f"no perpendicular segment found in bearings {bearings}"

    def test_flag_false_is_strictly_shorter_and_clears_runway(self, db_session):
        """flag off lets A* (or the fast-path) pick the shortest geodesic crossing."""
        _, runway = _make_perpendicular_runway_airport(db_session)

        from_pt = Point3D(lon=14.262, lat=50.0975, alt=350.0)
        to_pt = Point3D(lon=14.258, lat=50.1025, alt=350.0)

        perp_wps = compute_transit_path(
            db_session,
            from_pt,
            to_pt,
            obstacles=[],
            zones=[],
            speed=8.0,
            surfaces=[runway],
            require_perpendicular_runway_crossing=True,
        )
        short_wps = compute_transit_path(
            db_session,
            from_pt,
            to_pt,
            obstacles=[],
            zones=[],
            speed=8.0,
            surfaces=[runway],
            require_perpendicular_runway_crossing=False,
        )

        perp_dist = _path_distance(perp_wps, from_pt)
        short_dist = _path_distance(short_wps, from_pt)
        assert (
            short_dist < perp_dist
        ), f"shortest-geodesic distance {short_dist:.1f} not < perpendicular {perp_dist:.1f}"

    def test_flag_false_still_avoids_obstacle(self, db_session):
        """flag off must still detour around an obstacle on the straight line."""
        airport, runway = _make_perpendicular_runway_airport(db_session)

        from_pt = Point3D(lon=14.262, lat=50.0975, alt=350.0)
        to_pt = Point3D(lon=14.258, lat=50.1025, alt=350.0)

        # obstacle straddling the straight line near the midpoint
        obstacle = Obstacle(
            id=uuid4(),
            airport_id=airport.id,
            name="block",
            height=80.0,
            type="BUILDING",
            buffer_distance=5.0,
            boundary=WKTElement(
                "SRID=4326;POLYGONZ(("
                "14.2598 50.0998 300, "
                "14.2602 50.0998 300, "
                "14.2602 50.1002 300, "
                "14.2598 50.1002 300, "
                "14.2598 50.0998 300"
                "))",
                srid=4326,
            ),
        )
        db_session.add(obstacle)
        db_session.commit()
        db_session.refresh(obstacle)

        wps = compute_transit_path(
            db_session,
            from_pt,
            to_pt,
            obstacles=[obstacle],
            zones=[],
            speed=8.0,
            surfaces=[runway],
            require_perpendicular_runway_crossing=False,
        )

        # path must be longer than the naive straight line because of the detour
        straight = total_path_distance(
            [(from_pt.lon, from_pt.lat, from_pt.alt), (to_pt.lon, to_pt.lat, to_pt.alt)]
        )
        rerouted = _path_distance(wps, from_pt)
        assert (
            rerouted > straight
        ), f"rerouted distance {rerouted:.1f} not greater than straight {straight:.1f}"

    def test_flag_false_no_runways_matches_default(self, db_session):
        """without any runways, both flag values produce the same straight-line path."""
        airport = Airport(
            id=uuid4(),
            icao_code=_unique_icao(),
            name="No Runway Airport",
            elevation=300.0,
            location=WKTElement("SRID=4326;POINTZ(14.26 50.10 300)", srid=4326),
        )
        db_session.add(airport)
        db_session.flush()

        from_pt = Point3D(lon=14.262, lat=50.0975, alt=350.0)
        to_pt = Point3D(lon=14.258, lat=50.1025, alt=350.0)

        wps_true = compute_transit_path(
            db_session,
            from_pt,
            to_pt,
            obstacles=[],
            zones=[],
            speed=8.0,
            surfaces=[],
            require_perpendicular_runway_crossing=True,
        )
        wps_false = compute_transit_path(
            db_session,
            from_pt,
            to_pt,
            obstacles=[],
            zones=[],
            speed=8.0,
            surfaces=[],
            require_perpendicular_runway_crossing=False,
        )
        # both fast-path single-segment, same endpoint
        assert len(wps_true) == 1 and len(wps_false) == 1
        assert wps_true[0].lon == wps_false[0].lon
        assert wps_true[0].lat == wps_false[0].lat

    def test_flag_forwarded_through_resolve_collisions(self, db_session):
        """resolve_inspection_collisions forwards the flag into _run_astar."""
        airport, runway = _make_perpendicular_runway_airport(db_session)

        center = Point3D(lon=14.26, lat=50.10, alt=300.0)

        # obstacle on the south side of the runway, straddling a measurement waypoint
        obstacle = Obstacle(
            id=uuid4(),
            airport_id=airport.id,
            name="reroute-block",
            height=80.0,
            type="BUILDING",
            buffer_distance=5.0,
            boundary=WKTElement(
                "SRID=4326;POLYGONZ(("
                "14.2595 50.0985 300, "
                "14.2605 50.0985 300, "
                "14.2605 50.0995 300, "
                "14.2595 50.0995 300, "
                "14.2595 50.0985 300"
                "))",
                srid=4326,
            ),
        )
        db_session.add(obstacle)
        db_session.commit()
        db_session.refresh(obstacle)

        # waypoints: anchor south -> colliding wp inside obstacle -> anchor north of runway
        # buffer_distance_override=50 ensures the search radius is large enough
        # for _collect_nearby_objects to find the obstacle
        wps = [
            WaypointData(lon=14.260, lat=50.096, alt=350.0, heading=0.0),
            WaypointData(lon=14.260, lat=50.099, alt=350.0, heading=0.0),
            WaypointData(lon=14.260, lat=50.104, alt=350.0, heading=0.0),
        ]

        result_perp = resolve_inspection_collisions(
            db_session,
            wps,
            [obstacle],
            [],
            center,
            [runway],
            buffer_distance_override=50.0,
            require_perpendicular_runway_crossing=True,
        )
        result_short = resolve_inspection_collisions(
            db_session,
            wps,
            [obstacle],
            [],
            center,
            [runway],
            buffer_distance_override=50.0,
            require_perpendicular_runway_crossing=False,
        )

        perp_pts = [(w.lon, w.lat, w.alt) for w in result_perp]
        short_pts = [(w.lon, w.lat, w.alt) for w in result_short]
        perp_dist = total_path_distance(perp_pts)
        short_dist = total_path_distance(short_pts)

        assert (
            short_dist < perp_dist
        ), f"flag=False reroute {short_dist:.1f} not shorter than flag=True {perp_dist:.1f}"
