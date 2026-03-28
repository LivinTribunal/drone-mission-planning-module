import pytest

from tests.data.missions import (
    INVALID_AIRPORT_ID,
    MISSION_AIRPORT_PAYLOAD,
    MISSION_TEMPLATE_PAYLOAD,
    MISSION_UPDATE_PAYLOAD,
)


@pytest.fixture(scope="module")
def airport_id(client):
    """create a test airport for mission tests"""
    r = client.post("/api/v1/airports", json=MISSION_AIRPORT_PAYLOAD)

    return r.json()["id"]


# Tests
def test_create_mission(client, airport_id):
    """test create mission"""
    response = client.post(
        "/api/v1/missions", json={"name": "Test Mission", "airport_id": airport_id}
    )
    assert response.status_code == 201
    data = response.json()

    assert data["name"] == "Test Mission"
    assert data["status"] == "DRAFT"
    assert data["airport_id"] == airport_id


def test_create_mission_invalid_airport(client):
    """test create mission with invalid airport id"""
    response = client.post(
        "/api/v1/missions",
        json={"name": "Bad Mission", "airport_id": INVALID_AIRPORT_ID},
    )
    assert response.status_code == 400


def test_list_missions(client):
    """test list missions"""
    response = client.get("/api/v1/missions")
    assert response.status_code == 200
    body = response.json()

    assert body["meta"]["total"] >= 1


def test_list_missions_with_status_filter(client):
    """test list missions filtered by status"""
    response = client.get("/api/v1/missions?status=DRAFT")
    assert response.status_code == 200
    body = response.json()

    assert all(m["status"] == "DRAFT" for m in body["data"])


def test_list_missions_with_airport_filter(client, airport_id):
    """test list missions filtered by airport"""
    response = client.get(f"/api/v1/missions?airport_id={airport_id}")
    assert response.status_code == 200
    body = response.json()

    assert body["meta"]["total"] >= 1
    assert all(m["airport_id"] == airport_id for m in body["data"])


def test_get_mission_detail(client):
    """test get mission with inspections"""
    missions = client.get("/api/v1/missions").json()["data"]
    mission_id = missions[0]["id"]

    response = client.get(f"/api/v1/missions/{mission_id}")
    assert response.status_code == 200
    data = response.json()

    assert "inspections" in data


def test_update_mission(client):
    """test update mission"""
    missions = client.get("/api/v1/missions").json()["data"]
    mission_id = missions[0]["id"]

    response = client.put(
        f"/api/v1/missions/{mission_id}",
        json=MISSION_UPDATE_PAYLOAD,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Mission"


def test_duplicate_mission(client):
    """test duplicate mission clones inspections"""
    missions = client.get("/api/v1/missions").json()["data"]
    mission_id = missions[0]["id"]

    original = client.get(f"/api/v1/missions/{mission_id}").json()

    response = client.post(f"/api/v1/missions/{mission_id}/duplicate")
    assert response.status_code == 201
    data = response.json()

    assert data["status"] == "DRAFT"
    assert "(copy)" in data["name"]

    duplicate_detail = client.get(f"/api/v1/missions/{data['id']}").json()
    assert len(duplicate_detail["inspections"]) == len(original["inspections"])


def test_delete_mission(client, airport_id):
    """test delete mission"""
    response = client.post("/api/v1/missions", json={"name": "To Delete", "airport_id": airport_id})
    mission_id = response.json()["id"]

    response = client.delete(f"/api/v1/missions/{mission_id}")
    assert response.status_code == 200

    response = client.get(f"/api/v1/missions/{mission_id}")
    assert response.status_code == 404


def test_add_inspection(client):
    """test add inspection to mission"""
    template = client.post(
        "/api/v1/inspection-templates",
        json=MISSION_TEMPLATE_PAYLOAD,
    ).json()

    missions = client.get("/api/v1/missions").json()["data"]
    mission_id = missions[0]["id"]

    response = client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template["id"], "method": "ANGULAR_SWEEP"},
    )
    assert response.status_code == 201
    assert response.json()["method"] == "ANGULAR_SWEEP"


def test_list_missions_includes_inspection_count_and_duration(client):
    """test list response includes inspection_count and estimated_duration."""
    response = client.get("/api/v1/missions")
    assert response.status_code == 200
    body = response.json()

    for m in body["data"]:
        assert "inspection_count" in m
        assert "estimated_duration" in m
        assert isinstance(m["inspection_count"], int)


def test_delete_inspection(client):
    """test delete inspection from mission"""
    missions = client.get("/api/v1/missions").json()["data"]
    mission_id = missions[0]["id"]

    detail = client.get(f"/api/v1/missions/{mission_id}").json()
    assert len(detail["inspections"]) > 0, "precondition: mission must have inspections"
    insp_id = detail["inspections"][0]["id"]

    response = client.delete(f"/api/v1/missions/{mission_id}/inspections/{insp_id}")
    assert response.status_code == 200
