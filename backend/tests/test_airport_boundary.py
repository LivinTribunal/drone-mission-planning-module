"""tests for AIRPORT_BOUNDARY safety zone type and aggregate-root invariant."""

from uuid import uuid4

import pytest

from app.core.exceptions import ConflictError
from app.models.airport import Airport, SafetyZone
from app.models.enums import SafetyZoneType
from tests.data.airports import AIRPORT_PAYLOAD, SAFETY_ZONE_PAYLOAD


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


class TestUpdateSafetyZoneBoundaryConflict:
    """api-level tests for PATCH safety zone to AIRPORT_BOUNDARY when one already exists."""

    def _fresh_airport(self, client, icao: str):
        """create a fresh airport with the given ICAO and return its id."""
        payload = {**AIRPORT_PAYLOAD, "icao_code": icao}
        r = client.post("/api/v1/airports", json=payload)
        assert r.status_code == 201
        return r.json()["id"]

    def _boundary_payload(self):
        """boundary zone payload derived from default CTR payload, no altitude bounds."""
        return {
            "name": "Boundary",
            "type": "AIRPORT_BOUNDARY",
            "geometry": SAFETY_ZONE_PAYLOAD["geometry"],
        }

    def test_update_to_boundary_conflicts_with_existing(self, client):
        """patching a CTR zone to AIRPORT_BOUNDARY when one exists returns 409, not 500."""
        airport_id = self._fresh_airport(client, "LKUB")

        r = client.post(
            f"/api/v1/airports/{airport_id}/safety-zones", json=self._boundary_payload()
        )
        assert r.status_code == 201

        r = client.post(
            f"/api/v1/airports/{airport_id}/safety-zones",
            json={**SAFETY_ZONE_PAYLOAD, "name": "Other CTR"},
        )
        assert r.status_code == 201
        ctr_id = r.json()["id"]

        r = client.put(
            f"/api/v1/airports/{airport_id}/safety-zones/{ctr_id}",
            json={"type": "AIRPORT_BOUNDARY", "altitude_floor": None, "altitude_ceiling": None},
        )
        assert r.status_code == 409

    def test_update_altitude_on_boundary_rejected(self, client):
        """patching altitude fields on an AIRPORT_BOUNDARY zone returns 4xx, not silent success."""
        airport_id = self._fresh_airport(client, "LKUC")

        r = client.post(
            f"/api/v1/airports/{airport_id}/safety-zones", json=self._boundary_payload()
        )
        assert r.status_code == 201
        boundary_id = r.json()["id"]

        r = client.put(
            f"/api/v1/airports/{airport_id}/safety-zones/{boundary_id}",
            json={"altitude_floor": 100.0},
        )
        assert r.status_code in (400, 422)
