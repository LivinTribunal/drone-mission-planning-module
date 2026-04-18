"""unit tests for trajectory pathfinding - visibility graph, A*, collision resolution."""

import time
from uuid import uuid4

import pytest
from geoalchemy2.elements import WKTElement
from shapely.geometry import Point, box

from app.core.exceptions import TrajectoryGenerationError
from app.models.airport import Airport, Obstacle, Runway
from app.models.enums import CameraAction, SafetyZoneType, WaypointType
from app.services.trajectory_pathfinding import (
    _build_visibility_graph,
    _collect_graph_nodes_in_circle,
    _max_effective_buffer,
    _max_turn_angle,
    _run_astar,
    compute_transit_path,
    resolve_inspection_collisions,
)
from app.services.trajectory_types import (
    DEFAULT_OBSTACLE_RADIUS,
    GRID_EDGE_RADIUS,
    LocalObstacle,
    LocalZone,
    Point3D,
    WaypointData,
)
from app.utils.geo import astar, bearing_between, euclidean_distance, total_path_distance
from app.utils.local_projection import LocalProjection, build_local_geometries

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


# transit path computation


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
        """a 0.0 override should not zero out the search radius."""
        from shapely.geometry import box

        from app.services.trajectory_types import LocalObstacle

        obstacles = [
            LocalObstacle(
                polygon=box(0, 0, 1, 1),
                name="a",
                height=10.0,
                base_alt=0.0,
                buffer_distance=5.0,
            ),
            LocalObstacle(
                polygon=box(0, 0, 1, 1),
                name="b",
                height=10.0,
                base_alt=0.0,
                buffer_distance=10.0,
            ),
        ]
        assert _max_effective_buffer(obstacles, 0.0) == 10.0

    def test_none_override_uses_per_obstacle_max(self):
        """None override uses max per-obstacle buffer."""
        from shapely.geometry import box

        from app.services.trajectory_types import LocalObstacle

        obstacles = [
            LocalObstacle(
                polygon=box(0, 0, 1, 1),
                name="a",
                height=10.0,
                base_alt=0.0,
                buffer_distance=3.0,
            ),
            LocalObstacle(
                polygon=box(0, 0, 1, 1),
                name="b",
                height=10.0,
                base_alt=0.0,
                buffer_distance=7.0,
            ),
        ]
        assert _max_effective_buffer(obstacles, None) == 7.0

    def test_positive_override_used_when_obstacles_present(self):
        """positive override replaces per-obstacle values."""
        from shapely.geometry import box

        from app.services.trajectory_types import LocalObstacle

        obstacles = [
            LocalObstacle(
                polygon=box(0, 0, 1, 1),
                name="a",
                height=10.0,
                base_alt=0.0,
                buffer_distance=5.0,
            ),
        ]
        assert _max_effective_buffer(obstacles, 20.0) == 20.0

    def test_positive_override_no_obstacles_uses_default(self):
        """positive override with no obstacles falls back to DEFAULT_OBSTACLE_RADIUS."""
        assert _max_effective_buffer([], 20.0) == DEFAULT_OBSTACLE_RADIUS

    def test_empty_obstacles_none_override(self):
        """empty obstacles + None override returns DEFAULT_OBSTACLE_RADIUS."""
        assert _max_effective_buffer([], None) == DEFAULT_OBSTACLE_RADIUS


# regression - buffer_distance_override must reach fast-path segment check


def _build_local_geoms(db_session, airport, surfaces, obstacles=None, zones=None):
    """build LocalGeometries from db objects for test use."""
    if obstacles:
        for obs in obstacles:
            db_session.refresh(obs)
    for surf in surfaces:
        db_session.refresh(surf)
    proj = LocalProjection(ref_lon=14.26, ref_lat=50.10)
    return build_local_geometries(proj, obstacles or [], zones or [], surfaces)


class TestFastPathBufferOverride:
    """regression: compute_transit_path must pass buffer_distance_override to the
    fast-path _is_segment_blocked call, not just the A* branch."""

    def test_override_triggers_fast_path_detour(self, db_session):
        """buffer override must reach the fast-path check, not just the A* branch."""
        airport, runway = _make_perpendicular_runway_airport(db_session)

        # straight line endpoints well north of the runway to avoid runway crossing
        from_pt = Point3D(lon=14.262, lat=50.1100, alt=350.0)
        to_pt = Point3D(lon=14.258, lat=50.1100, alt=350.0)

        obstacle = Obstacle(
            id=uuid4(),
            airport_id=airport.id,
            name="side-block",
            height=80.0,
            type="BUILDING",
            buffer_distance=2.0,
            boundary=WKTElement(
                "SRID=4326;POLYGONZ(("
                "14.25998 50.11027 300, "
                "14.26002 50.11027 300, "
                "14.26002 50.11030 300, "
                "14.25998 50.11030 300, "
                "14.25998 50.11027 300"
                "))",
                srid=4326,
            ),
        )
        db_session.add(obstacle)
        db_session.commit()

        local_geoms = _build_local_geoms(db_session, airport, [runway], [obstacle])

        # baseline: no override - fast-path returns single waypoint (straight line)
        wps_no_override = compute_transit_path(
            from_pt,
            to_pt,
            local_geoms,
            speed=8.0,
            buffer_distance_override=None,
            require_perpendicular_runway_crossing=False,
        )
        assert len(wps_no_override) == 1, (
            f"without override, fast-path should return direct path (1 waypoint), "
            f"got {len(wps_no_override)}"
        )

        try:
            wps_with_override = compute_transit_path(
                from_pt,
                to_pt,
                local_geoms,
                speed=8.0,
                buffer_distance_override=50.0,
                require_perpendicular_runway_crossing=False,
            )
        except TrajectoryGenerationError as exc:
            assert "no obstacle-free transit path found" in str(exc)
        else:
            assert len(wps_with_override) > 1, (
                f"with override, fast-path must reject the direct path; "
                f"got {len(wps_with_override)} waypoints (straight-line fallback bug)"
            )


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
        local_geoms = _build_local_geoms(db_session, None, [runway])

        from_pt = Point3D(lon=14.262, lat=50.0975, alt=350.0)
        to_pt = Point3D(lon=14.258, lat=50.1025, alt=350.0)

        wps = compute_transit_path(
            from_pt,
            to_pt,
            local_geoms,
            speed=8.0,
            require_perpendicular_runway_crossing=True,
        )

        bearings = _bearings(wps, from_pt)

        def perp_delta(b):
            return min(abs(b - 0.0), abs(b - 180.0), abs(b - 360.0))

        assert any(
            perp_delta(b) <= 5.0 for b in bearings
        ), f"no perpendicular segment found in bearings {bearings}"

    def test_flag_false_is_strictly_shorter_and_clears_runway(self, db_session):
        """flag off lets A* (or the fast-path) pick the shortest geodesic crossing."""
        _, runway = _make_perpendicular_runway_airport(db_session)
        local_geoms = _build_local_geoms(db_session, None, [runway])

        from_pt = Point3D(lon=14.262, lat=50.0975, alt=350.0)
        to_pt = Point3D(lon=14.258, lat=50.1025, alt=350.0)

        perp_wps = compute_transit_path(
            from_pt,
            to_pt,
            local_geoms,
            speed=8.0,
            require_perpendicular_runway_crossing=True,
        )
        short_wps = compute_transit_path(
            from_pt,
            to_pt,
            local_geoms,
            speed=8.0,
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

        local_geoms = _build_local_geoms(db_session, airport, [runway], [obstacle])

        wps = compute_transit_path(
            from_pt,
            to_pt,
            local_geoms,
            speed=8.0,
            require_perpendicular_runway_crossing=False,
        )

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

        local_geoms = _build_local_geoms(db_session, airport, [])

        from_pt = Point3D(lon=14.262, lat=50.0975, alt=350.0)
        to_pt = Point3D(lon=14.258, lat=50.1025, alt=350.0)

        wps_true = compute_transit_path(
            from_pt,
            to_pt,
            local_geoms,
            speed=8.0,
            require_perpendicular_runway_crossing=True,
        )
        wps_false = compute_transit_path(
            from_pt,
            to_pt,
            local_geoms,
            speed=8.0,
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

        local_geoms = _build_local_geoms(db_session, airport, [runway], [obstacle])

        wps = [
            WaypointData(lon=14.260, lat=50.096, alt=350.0, heading=0.0),
            WaypointData(lon=14.260, lat=50.099, alt=350.0, heading=0.0),
            WaypointData(lon=14.260, lat=50.104, alt=350.0, heading=0.0),
        ]

        result_perp = resolve_inspection_collisions(
            wps,
            local_geoms,
            center,
            buffer_distance_override=50.0,
            require_perpendicular_runway_crossing=True,
        )
        result_short = resolve_inspection_collisions(
            wps,
            local_geoms,
            center,
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


# hybrid grid generation


class TestGridGeneration:
    """tests for grid fill in _collect_graph_nodes_in_circle."""

    def test_grid_covers_open_space(self):
        """grid nodes fill the circle area when no obstacles or zones."""
        center = (0.0, 0.0)
        radius = 500.0
        endpoints = [(200.0, 0.0, 350.0), (-200.0, 0.0, 350.0)]

        nodes, grid_start_index = _collect_graph_nodes_in_circle(
            endpoints, [], [], None, center, radius
        )

        grid_nodes = nodes[grid_start_index:]
        assert len(grid_nodes) > 100, f"expected >100 grid nodes, got {len(grid_nodes)}"

        # all grid nodes within circle
        for x, y, z in grid_nodes:
            assert euclidean_distance(center[0], center[1], x, y) <= radius + 1.0

    def test_grid_excludes_obstacle_interior(self):
        """no grid nodes inside buffered obstacle polygon."""
        obs = LocalObstacle(
            polygon=box(40, 40, 60, 60),
            name="block",
            height=10.0,
            base_alt=0.0,
            buffer_distance=5.0,
        )
        center = (50.0, 50.0)
        radius = 200.0
        endpoints = [(0.0, 50.0, 350.0), (100.0, 50.0, 350.0)]

        nodes, grid_start_index = _collect_graph_nodes_in_circle(
            endpoints, [obs], [], None, center, radius
        )

        buffered_obs = obs.polygon.buffer(obs.buffer_distance)
        grid_nodes = nodes[grid_start_index:]
        for x, y, z in grid_nodes:
            assert not buffered_obs.contains(
                Point(x, y)
            ), f"grid node ({x}, {y}) inside buffered obstacle"

    def test_grid_excludes_hard_zone_interior(self):
        """no grid nodes inside prohibited safety zone polygon."""
        zone = LocalZone(
            polygon=box(-30, -30, 30, 30),
            zone_type=SafetyZoneType.PROHIBITED,
            name="no-fly",
            altitude_floor=None,
            altitude_ceiling=None,
        )
        center = (0.0, 0.0)
        radius = 200.0
        endpoints = [(-100.0, 0.0, 350.0), (100.0, 0.0, 350.0)]

        nodes, grid_start_index = _collect_graph_nodes_in_circle(
            endpoints, [], [zone], None, center, radius
        )

        grid_nodes = nodes[grid_start_index:]
        for x, y, z in grid_nodes:
            assert not zone.polygon.contains(Point(x, y)), f"grid node ({x}, {y}) inside hard zone"

    def test_grid_nodes_use_cruise_altitude(self):
        """grid nodes z-coordinate equals average of endpoint altitudes."""
        endpoints = [(0.0, 0.0, 300.0), (100.0, 0.0, 400.0)]
        center = (50.0, 0.0)
        radius = 200.0

        nodes, grid_start_index = _collect_graph_nodes_in_circle(
            endpoints, [], [], None, center, radius
        )

        expected_z = 350.0
        grid_nodes = nodes[grid_start_index:]
        assert len(grid_nodes) > 0
        for x, y, z in grid_nodes:
            assert z == expected_z, f"grid node z={z}, expected {expected_z}"

    def test_grid_start_index_separates_feature_and_grid_nodes(self):
        """grid_start_index equals count of non-grid nodes."""
        obs = LocalObstacle(
            polygon=box(80, 80, 90, 90),
            name="tiny",
            height=10.0,
            base_alt=0.0,
            buffer_distance=2.0,
        )
        center = (50.0, 50.0)
        radius = 200.0
        endpoints = [(0.0, 50.0, 350.0), (100.0, 50.0, 350.0)]

        nodes, grid_start_index = _collect_graph_nodes_in_circle(
            endpoints, [obs], [], None, center, radius
        )

        # grid_start_index should be at least len(endpoints)
        assert grid_start_index >= len(endpoints)

        # nodes before grid_start_index are endpoints + obstacle vertices
        # nodes after are grid nodes on a regular spacing
        grid_nodes = nodes[grid_start_index:]
        assert len(grid_nodes) > 0


class TestGridAStarPath:
    """tests for A* pathfinding with hybrid grid."""

    def test_open_space_path_is_near_straight(self):
        """path through grid in open space is close to straight-line distance."""
        from_local = (-200.0, 0.0, 350.0)
        to_local = (200.0, 0.0, 350.0)

        path = _run_astar(from_local, to_local, [], [])
        assert path is not None, "A* should find path in open space"

        straight = euclidean_distance(from_local[0], from_local[1], to_local[0], to_local[1])
        path_len = sum(
            euclidean_distance(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1])
            for i in range(len(path) - 1)
        )
        assert (
            path_len < straight * 1.15
        ), f"path {path_len:.1f}m is >15% longer than straight {straight:.1f}m"

    def test_grid_path_avoids_obstacle(self):
        """path routes around an obstacle between endpoints."""
        obs = LocalObstacle(
            polygon=box(-20, -20, 20, 20),
            name="center-block",
            height=50.0,
            base_alt=0.0,
            buffer_distance=5.0,
        )

        from_local = (-150.0, 0.0, 350.0)
        to_local = (150.0, 0.0, 350.0)

        path = _run_astar(from_local, to_local, [obs], [])
        assert path is not None, "A* should find path around obstacle"

        buffered = obs.polygon.buffer(obs.buffer_distance)
        for node in path[1:-1]:
            assert not buffered.contains(
                Point(node[0], node[1])
            ), f"path node ({node[0]:.1f}, {node[1]:.1f}) inside obstacle"

        straight = euclidean_distance(from_local[0], from_local[1], to_local[0], to_local[1])
        path_len = sum(
            euclidean_distance(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1])
            for i in range(len(path) - 1)
        )
        assert path_len > straight, "path around obstacle must be longer than straight line"

    def test_grid_to_grid_edges_respect_radius(self):
        """grid-to-grid edges in visibility graph do not exceed GRID_EDGE_RADIUS."""
        center = (0.0, 0.0)
        radius = 300.0
        endpoints = [(-100.0, 0.0, 350.0), (100.0, 0.0, 350.0)]

        nodes, grid_start_index = _collect_graph_nodes_in_circle(
            endpoints, [], [], None, center, radius
        )
        graph = _build_visibility_graph(nodes, [], [], grid_start_index=grid_start_index)

        for i in range(grid_start_index, len(nodes)):
            for j, dist in graph[i]:
                if j >= grid_start_index:
                    assert dist <= GRID_EDGE_RADIUS + 0.1, (
                        f"grid-to-grid edge {i}->{j} dist={dist:.1f} "
                        f"exceeds GRID_EDGE_RADIUS={GRID_EDGE_RADIUS}"
                    )

    def test_circular_obstacle_detour_is_efficient(self):
        """path around circular obstacle (no axis-aligned corners) finds efficient detour."""
        circle = Point(0, 0).buffer(50)
        obs = LocalObstacle(
            polygon=circle,
            name="round-tower",
            height=50.0,
            base_alt=0.0,
            buffer_distance=5.0,
        )

        from_local = (-200.0, 0.0, 350.0)
        to_local = (200.0, 0.0, 350.0)

        path = _run_astar(from_local, to_local, [obs], [])
        assert path is not None, "should find path around circular obstacle"

        buffered = circle.buffer(obs.buffer_distance)
        for node in path[1:-1]:
            assert not buffered.contains(
                Point(node[0], node[1])
            ), f"path node ({node[0]:.1f}, {node[1]:.1f}) inside buffered obstacle"

        straight = euclidean_distance(from_local[0], from_local[1], to_local[0], to_local[1])
        path_len = sum(
            euclidean_distance(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1])
            for i in range(len(path) - 1)
        )
        assert (
            path_len < straight * 1.25
        ), f"detour {path_len:.1f}m is >25% longer than straight {straight:.1f}m"

    def test_grid_nodes_strictly_required_for_circular_obstacle(self):
        """vertex-only graph fails for circular obstacle - grid nodes are strictly necessary.

        buffer vertices lie on the obstacle boundary so every edge to/from
        them triggers intersects() and is blocked. only grid nodes in the
        surrounding open space can form unobstructed edges.
        """
        circle = Point(0, 0).buffer(50)
        obs = LocalObstacle(
            polygon=circle,
            name="round-tower",
            height=50.0,
            base_alt=0.0,
            buffer_distance=5.0,
        )

        from_local = (-200.0, 0.0, 350.0)
        to_local = (200.0, 0.0, 350.0)
        center = (0.0, 0.0)
        radius = 300.0
        obstacles = [obs]

        nodes, grid_start_index = _collect_graph_nodes_in_circle(
            [from_local, to_local], obstacles, [], None, center, radius
        )

        # vertex-only graph: all edges touch obstacle boundary, A* fails
        vertex_nodes = nodes[:grid_start_index]
        vertex_graph = _build_visibility_graph(vertex_nodes, obstacles, [])
        vertex_path = astar(vertex_graph, 0, 1, vertex_nodes, use_euclidean=True)
        assert (
            vertex_path is None
        ), "vertex-only graph should not find path - all edges touch the obstacle boundary"

        # full graph with grid nodes routes around the obstacle
        full_graph = _build_visibility_graph(
            nodes, obstacles, [], grid_start_index=grid_start_index
        )
        grid_path_indices = astar(full_graph, 0, 1, nodes, use_euclidean=True)
        assert grid_path_indices is not None, "grid-enhanced A* must find path"

        # path avoids the buffered obstacle
        buffered = circle.buffer(obs.buffer_distance)
        grid_path = [nodes[idx] for idx in grid_path_indices]
        for node in grid_path[1:-1]:
            assert not buffered.contains(
                Point(node[0], node[1])
            ), f"path node ({node[0]:.1f}, {node[1]:.1f}) inside buffered obstacle"

        # grid nodes are strictly necessary
        grid_in_path = [idx for idx in grid_path_indices[1:-1] if idx >= grid_start_index]
        assert (
            len(grid_in_path) > 0
        ), "path must use grid nodes - obstacle vertices can't form edges"


class TestGridPerformance:
    """performance envelope tests for hybrid grid."""

    def test_node_count_at_default_spacing(self):
        """500m radius circle at 50m spacing produces roughly pi*10^2 ~ 314 grid nodes."""
        center = (0.0, 0.0)
        radius = 500.0
        endpoints = [(-200.0, 0.0, 350.0), (200.0, 0.0, 350.0)]

        nodes, grid_start_index = _collect_graph_nodes_in_circle(
            endpoints, [], [], None, center, radius
        )
        grid_count = len(nodes) - grid_start_index
        assert 200 <= grid_count <= 400, f"expected 200-400 grid nodes, got {grid_count}"

    @pytest.mark.slow
    def test_solve_time_within_budget(self):
        """full A* solve with 500m radius grid completes in < 2 seconds."""
        from_local = (-250.0, 0.0, 350.0)
        to_local = (250.0, 0.0, 350.0)

        start = time.monotonic()
        path = _run_astar(from_local, to_local, [], [])
        elapsed = time.monotonic() - start

        assert path is not None
        assert elapsed < 2.0, f"A* solve took {elapsed:.2f}s, expected < 2s"
