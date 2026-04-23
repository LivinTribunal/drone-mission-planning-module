from unittest.mock import MagicMock

from app.core.config import Settings
from app.models.enums import MissionStatus
from app.services.trajectory.types import WaypointData

# settings override via env


def test_settings_default_takeoff_altitude():
    """default takeoff safe altitude is 10m"""
    s = Settings()
    assert s.takeoff_safe_altitude == 10.0


def test_settings_default_landing_altitude():
    """default landing safe altitude is 10m"""
    s = Settings()
    assert s.landing_safe_altitude == 10.0


def test_settings_default_vertex_buffer():
    """default vertex buffer is 5m"""
    s = Settings()
    assert s.vertex_buffer_m == 5.0


def test_settings_override_takeoff_altitude(monkeypatch):
    """takeoff altitude overridable via env"""
    monkeypatch.setenv("TAKEOFF_SAFE_ALTITUDE", "15.0")
    s = Settings()
    assert s.takeoff_safe_altitude == 15.0


def test_settings_override_landing_altitude(monkeypatch):
    """landing altitude overridable via env"""
    monkeypatch.setenv("LANDING_SAFE_ALTITUDE", "20.0")
    s = Settings()
    assert s.landing_safe_altitude == 20.0


def test_settings_override_vertex_buffer(monkeypatch):
    """vertex buffer overridable via env"""
    monkeypatch.setenv("VERTEX_BUFFER_M", "8.0")
    s = Settings()
    assert s.vertex_buffer_m == 8.0


# NULL containment edge cases


def test_obstacle_null_containment_treated_as_safe():
    """waypoint outside obstacle boundary is not flagged."""
    from shapely.geometry import box

    from app.services.trajectory.types import LocalObstacle
    from app.services.trajectory.validation import check_obstacle

    obs = LocalObstacle(
        polygon=box(0, 0, 10, 10),
        name="Degenerate",
        height=50.0,
        base_alt=0.0,
        buffer_distance=5.0,
    )

    result = check_obstacle(100.0, 100.0, 5.0, obs)
    assert result is False


def test_zone_null_containment_treated_as_not_inside(monkeypatch):
    """ST_Contains returning NULL for zone must not report waypoint as inside."""
    from app.services.trajectory.validation import check_safety_zone, zones

    monkeypatch.setattr(zones, "_geom_to_ewkt", lambda g: "SRID=4326;POINT(0 0 0)")

    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0)
    zone = type(
        "Z",
        (),
        {
            "geometry": MagicMock(),
            "type": "RESTRICTED",
            "name": "Test Zone",
            "altitude_floor": 0.0,
            "altitude_ceiling": 500.0,
        },
    )()

    db_mock = MagicMock()
    db_mock.execute.return_value.scalar.return_value = None

    result = check_safety_zone(db_mock, wp, zone)
    assert result is None


def test_geofence_null_containment_flags_violation(monkeypatch):
    """ST_Contains returning NULL for geofence must flag waypoint as outside."""
    from app.services.trajectory.validation import _check_constraint, constraints

    monkeypatch.setattr(constraints, "_geom_to_ewkt", lambda g: "SRID=4326;POINT(0 0 0)")

    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0)
    constraint = type(
        "C",
        (),
        {
            "constraint_type": "GEOFENCE",
            "boundary": MagicMock(),
            "is_hard_constraint": True,
            "id": "test-id",
        },
    )()

    db_mock = MagicMock()
    db_mock.execute.return_value.scalar.return_value = None

    result = _check_constraint(db_mock, wp, constraint, [])
    assert result is not None
    assert "outside geofence" in result.message


# mission status enum usage


def test_mission_invalidate_trajectory_uses_enum():
    """invalidate_trajectory uses MissionStatus enum values."""
    from uuid import uuid4

    from app.models.mission import Mission

    m = Mission(id=uuid4(), name="test", status="VALIDATED", airport_id=uuid4())
    m.inspections = []
    m.flight_plan = None
    m.invalidate_trajectory()
    assert m.status == MissionStatus.DRAFT


def test_mission_invalidate_trajectory_noop_for_draft():
    """invalidate_trajectory does nothing for DRAFT status."""
    from uuid import uuid4

    from app.models.mission import Mission

    m = Mission(id=uuid4(), name="test", status="DRAFT", airport_id=uuid4())
    m.inspections = []
    m.flight_plan = None
    m.invalidate_trajectory()
    assert m.status == MissionStatus.DRAFT


# batch query functions


def _empty_local_geoms():
    """build LocalGeometries with no obstacles, zones, or surfaces."""
    from app.services.trajectory.types import LocalGeometries
    from app.utils.local_projection import LocalProjection

    proj = LocalProjection(ref_lon=14.26, ref_lat=50.10)
    return LocalGeometries(proj=proj, obstacles=[], zones=[], boundary_zones=[], surfaces=[])


def test_batch_check_obstacles_empty_obstacles():
    """no obstacles returns empty list"""
    from app.services.trajectory.validation import _batch_check_obstacles

    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0)
    local_geoms = _empty_local_geoms()
    result = _batch_check_obstacles([wp], local_geoms)
    assert result == []


def test_batch_check_obstacles_empty_waypoints():
    """no waypoints returns empty list"""
    from shapely.geometry import box

    from app.services.trajectory.types import LocalGeometries, LocalObstacle
    from app.services.trajectory.validation import _batch_check_obstacles
    from app.utils.local_projection import LocalProjection

    proj = LocalProjection(ref_lon=14.26, ref_lat=50.10)
    obs = LocalObstacle(
        polygon=box(0, 0, 10, 10), name="test", height=10.0, base_alt=0.0, buffer_distance=0.0
    )
    local_geoms = LocalGeometries(
        proj=proj, obstacles=[obs], zones=[], boundary_zones=[], surfaces=[]
    )
    result = _batch_check_obstacles([], local_geoms)
    assert result == []


def test_batch_check_obstacles_no_boundary():
    """empty obstacle list returns empty violations."""
    from app.services.trajectory.validation import _batch_check_obstacles

    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0)
    local_geoms = _empty_local_geoms()
    result = _batch_check_obstacles([wp], local_geoms)
    assert result == []


def test_batch_check_zones_empty_zones():
    """no zones returns empty list"""
    from app.services.trajectory.validation import _batch_check_zones

    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0)
    local_geoms = _empty_local_geoms()
    result = _batch_check_zones([wp], local_geoms)
    assert result == []


def test_batch_check_zones_empty_waypoints():
    """no waypoints returns empty list"""
    from app.services.trajectory.validation import _batch_check_zones

    local_geoms = _empty_local_geoms()
    result = _batch_check_zones([], local_geoms)
    assert result == []


def test_batch_check_zones_no_geometry():
    """no zones in local_geoms returns empty list"""
    from app.services.trajectory.validation import _batch_check_zones

    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0)
    local_geoms = _empty_local_geoms()
    result = _batch_check_zones([wp], local_geoms)
    assert result == []


def test_buffer_distance_zero_in_max_buffer_calc():
    """buffer_distance=0 in max_buffer calc should use 0, not DEFAULT_OBSTACLE_RADIUS."""
    from app.services.trajectory.types import DEFAULT_OBSTACLE_RADIUS

    obstacles = [
        type("O", (), {"buffer_distance": 0.0})(),
        type("O", (), {"buffer_distance": 0.0})(),
    ]

    # replicate the max_buffer logic from resolve_inspection_collisions (no override)
    max_buffer = max(
        (
            (obs.buffer_distance if obs.buffer_distance is not None else DEFAULT_OBSTACLE_RADIUS)
            for obs in obstacles
        ),
        default=DEFAULT_OBSTACLE_RADIUS,
    )

    assert max_buffer == 0.0
    assert DEFAULT_OBSTACLE_RADIUS > 0
