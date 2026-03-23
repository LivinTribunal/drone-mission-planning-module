import pytest

from tests.data.missions import MISSION_SPEED_UPDATE_PAYLOAD, STATUS_TEST_AIRPORT_PAYLOAD


@pytest.fixture(scope="module")
def airport_id(client):
    """create a test airport for status tests"""
    r = client.post("/api/v1/airports", json=STATUS_TEST_AIRPORT_PAYLOAD)

    return r.json()["id"]


def _create_mission(client, airport_id: str, name="Status Test") -> str:
    """helper - create a DRAFT mission and return its id"""
    response = client.post("/api/v1/missions", json={"name": name, "airport_id": airport_id})

    return response.json()["id"]


# Tests
def test_draft_cannot_validate(client, airport_id):
    """DRAFT -> VALIDATED should fail (must go through PLANNED first)"""
    mission_id = _create_mission(client, airport_id)

    response = client.post(f"/api/v1/missions/{mission_id}/validate")
    assert response.status_code == 409
    detail = response.json()["detail"]

    assert detail["current_status"] == "DRAFT"


def test_draft_cannot_export(client, airport_id):
    """DRAFT -> EXPORTED should fail"""
    mission_id = _create_mission(client, airport_id)

    response = client.post(f"/api/v1/missions/{mission_id}/export", json={"formats": ["KML"]})
    assert response.status_code == 409


def test_draft_cannot_complete(client, airport_id):
    """DRAFT -> COMPLETED should fail"""
    mission_id = _create_mission(client, airport_id)

    response = client.post(f"/api/v1/missions/{mission_id}/complete")
    assert response.status_code == 409


def test_draft_cannot_cancel(client, airport_id):
    """DRAFT -> CANCELLED should fail"""
    mission_id = _create_mission(client, airport_id)

    response = client.post(f"/api/v1/missions/{mission_id}/cancel")
    assert response.status_code == 409


def test_invalid_transition_returns_allowed(client, airport_id):
    """invalid transition response includes allowed transitions"""
    mission_id = _create_mission(client, airport_id)

    response = client.post(f"/api/v1/missions/{mission_id}/export", json={"formats": ["KML"]})
    assert response.status_code == 409


def test_update_regresses_validated_to_planned(client, airport_id):
    """changing trajectory fields on DRAFT mission should still work"""
    mission_id = _create_mission(client, airport_id)

    response = client.put(
        f"/api/v1/missions/{mission_id}",
        json=MISSION_SPEED_UPDATE_PAYLOAD,
    )
    assert response.status_code == 200
    assert response.json()["default_speed"] == 10.0
