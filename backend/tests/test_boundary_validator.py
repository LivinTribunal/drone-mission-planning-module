"""real-postgis tests for AIRPORT_BOUNDARY inverted containment."""

from types import SimpleNamespace

import pytest
from geoalchemy2.elements import WKBElement
from sqlalchemy import text

from app.models.enums import SafetyZoneType
from app.services.safety_validator import _batch_check_boundary_zones, check_safety_zone
from app.services.trajectory_types import WaypointData

# boundary square around prague area
_BOUNDARY_WKT = (
    "POLYGON Z ((14.25 50.09 0, 14.27 50.09 0, 14.27 50.11 0, 14.25 50.11 0, 14.25 50.09 0))"
)


@pytest.fixture
def boundary_wkb(db_session):
    """return a WKBElement for the boundary polygon via round-trip through postgis."""
    hex_wkb = db_session.execute(
        text("SELECT ST_AsEWKB(ST_GeomFromText(:wkt, 4326))"),
        {"wkt": _BOUNDARY_WKT},
    ).scalar()
    return WKBElement(bytes(hex_wkb), srid=4326)


def _boundary_zone(geom, name: str = "fence") -> SimpleNamespace:
    """build a minimal SafetyZone-like stub backed by a WKBElement geometry."""
    return SimpleNamespace(
        id="zone-1",
        name=name,
        type=SafetyZoneType.AIRPORT_BOUNDARY.value,
        geometry=geom,
        altitude_floor=None,
        altitude_ceiling=None,
    )


def test_waypoint_inside_boundary_no_violation(db_session, boundary_wkb):
    """waypoint inside the boundary polygon does not produce a violation."""
    wp = WaypointData(lon=14.26, lat=50.10, alt=100.0)
    zone = _boundary_zone(boundary_wkb)

    result = _batch_check_boundary_zones(db_session, [wp], [zone])

    assert result == []


def test_waypoint_outside_boundary_soft_violation(db_session, boundary_wkb):
    """waypoint outside the boundary polygon is a soft geofence warning (pending A* rerouting)."""
    wp = WaypointData(lon=14.30, lat=50.20, alt=100.0)
    zone = _boundary_zone(boundary_wkb, name="prague fence")

    result = _batch_check_boundary_zones(db_session, [wp], [zone])

    assert len(result) == 1
    violation = result[0]
    assert violation.is_warning
    assert violation.violation_kind == "geofence"
    assert "prague fence" in violation.message
    assert violation.waypoint_index == 0


def test_mixed_waypoints_only_outside_flagged(db_session, boundary_wkb):
    """only the waypoint outside the boundary is flagged."""
    inside = WaypointData(lon=14.26, lat=50.10, alt=100.0)
    outside = WaypointData(lon=14.50, lat=50.50, alt=100.0)
    zone = _boundary_zone(boundary_wkb)

    result = _batch_check_boundary_zones(db_session, [inside, outside], [zone])

    indices = {v.waypoint_index for v in result}
    assert indices == {1}


def test_check_safety_zone_inverted_for_boundary(db_session, boundary_wkb):
    """check_safety_zone applies inverted semantics to AIRPORT_BOUNDARY zones."""
    outside = WaypointData(lon=14.30, lat=50.20, alt=100.0)
    zone = _boundary_zone(boundary_wkb)

    result = check_safety_zone(db_session, outside, zone)

    assert result is not None
    assert result.is_warning
    assert result.violation_kind == "geofence"


def test_check_safety_zone_inside_boundary_no_violation(db_session, boundary_wkb):
    """waypoint inside the boundary returns no violation via check_safety_zone."""
    inside = WaypointData(lon=14.26, lat=50.10, alt=100.0)
    zone = _boundary_zone(boundary_wkb)

    assert check_safety_zone(db_session, inside, zone) is None


def test_boundary_ignores_altitude_band(db_session, boundary_wkb):
    """boundary violations trigger regardless of altitude_floor/ceiling values."""
    # very low outside waypoint - altitude band would otherwise suppress the violation
    outside = WaypointData(lon=14.30, lat=50.20, alt=5.0)
    zone = _boundary_zone(boundary_wkb)
    # explicitly set an altitude band that does not contain 5m
    zone.altitude_floor = 100.0
    zone.altitude_ceiling = 500.0

    result = _batch_check_boundary_zones(db_session, [outside], [zone])

    assert len(result) == 1
    assert result[0].violation_kind == "geofence"
