"""tests for AIRPORT_BOUNDARY safety zone type and aggregate-root invariant."""

from uuid import uuid4

import pytest

from app.core.exceptions import ConflictError
from app.models.airport import Airport, SafetyZone
from app.models.enums import SafetyZoneType


def _make_airport() -> Airport:
    """build a bare airport instance with an empty safety_zones collection."""
    a = Airport(id=uuid4(), icao_code="TEST", name="Test Airport", elevation=0.0)
    a.safety_zones = []
    return a


def _make_zone(type_: str, name: str = "zone") -> SafetyZone:
    """build a bare safety zone of a given type."""
    return SafetyZone(id=uuid4(), name=name, type=type_)


class TestSafetyZoneTypeEnum:
    """tests covering the SafetyZoneType enum addition."""

    def test_airport_boundary_member_present(self):
        """AIRPORT_BOUNDARY is a member of SafetyZoneType."""
        assert SafetyZoneType.AIRPORT_BOUNDARY.value == "AIRPORT_BOUNDARY"

    def test_existing_members_unchanged(self):
        """original members are still defined."""
        for name in ("CTR", "RESTRICTED", "PROHIBITED", "TEMPORARY_NO_FLY"):
            assert SafetyZoneType[name].value == name


class TestAirportBoundaryInvariant:
    """tests for the one-boundary-per-airport invariant on Airport.add_safety_zone."""

    def test_adds_first_boundary(self):
        """first AIRPORT_BOUNDARY zone is accepted."""
        airport = _make_airport()
        airport.add_safety_zone(_make_zone(SafetyZoneType.AIRPORT_BOUNDARY.value))
        assert len(airport.safety_zones) == 1

    def test_rejects_second_boundary(self):
        """second AIRPORT_BOUNDARY raises ConflictError."""
        airport = _make_airport()
        airport.add_safety_zone(_make_zone(SafetyZoneType.AIRPORT_BOUNDARY.value, "first"))
        with pytest.raises(ConflictError, match="Airport boundary already exists"):
            airport.add_safety_zone(_make_zone(SafetyZoneType.AIRPORT_BOUNDARY.value, "second"))

    def test_conflict_error_status_code(self):
        """ConflictError propagates HTTP 409 via its status_code attribute."""
        airport = _make_airport()
        airport.add_safety_zone(_make_zone(SafetyZoneType.AIRPORT_BOUNDARY.value))
        with pytest.raises(ConflictError) as excinfo:
            airport.add_safety_zone(_make_zone(SafetyZoneType.AIRPORT_BOUNDARY.value))
        assert excinfo.value.status_code == 409

    def test_allows_boundary_plus_other_zones(self):
        """boundary coexists freely with CTR, RESTRICTED, PROHIBITED, TEMPORARY_NO_FLY."""
        airport = _make_airport()
        airport.add_safety_zone(_make_zone(SafetyZoneType.AIRPORT_BOUNDARY.value, "b"))
        airport.add_safety_zone(_make_zone(SafetyZoneType.CTR.value, "c"))
        airport.add_safety_zone(_make_zone(SafetyZoneType.PROHIBITED.value, "p"))
        airport.add_safety_zone(_make_zone(SafetyZoneType.RESTRICTED.value, "r"))
        assert len(airport.safety_zones) == 4

    def test_multiple_regular_zones_allowed(self):
        """multiple regular zones of the same type still accepted."""
        airport = _make_airport()
        airport.add_safety_zone(_make_zone(SafetyZoneType.CTR.value, "c1"))
        airport.add_safety_zone(_make_zone(SafetyZoneType.CTR.value, "c2"))
        assert len(airport.safety_zones) == 2
