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


def test_duplicate_mission_preserves_lha_ids(client, airport_id):
    """duplicate mission preserves lha_ids from inspection configs."""
    from uuid import uuid4

    # create mission with inspection that has lha_ids in config
    template = client.post(
        "/api/v1/inspection-templates",
        json={"name": "LHA Dup Template", "methods": ["ANGULAR_SWEEP"]},
    ).json()

    mission = client.post(
        "/api/v1/missions",
        json={"name": "LHA Dup Mission", "airport_id": airport_id},
    ).json()

    lha_id_1 = str(uuid4())
    lha_id_2 = str(uuid4())

    client.post(
        f"/api/v1/missions/{mission['id']}/inspections",
        json={
            "template_id": template["id"],
            "method": "ANGULAR_SWEEP",
            "config": {"lha_ids": [lha_id_1, lha_id_2]},
        },
    )

    # duplicate
    dup = client.post(f"/api/v1/missions/{mission['id']}/duplicate")
    assert dup.status_code == 201

    dup_detail = client.get(f"/api/v1/missions/{dup.json()['id']}").json()
    assert len(dup_detail["inspections"]) == 1

    dup_config = dup_detail["inspections"][0].get("config")
    assert dup_config is not None
    assert dup_config["lha_ids"] == [lha_id_1, lha_id_2]


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


def test_create_mission_accepts_valid_default_transit_altitude(client, airport_id):
    """mission create persists default_transit_altitude when above the 30m AGL floor."""
    response = client.post(
        "/api/v1/missions",
        json={
            "name": "Cruise Mission",
            "airport_id": airport_id,
            "default_transit_altitude": 80.0,
        },
    )
    assert response.status_code == 201
    assert response.json()["default_transit_altitude"] == 80.0


def test_create_mission_rejects_default_transit_altitude_below_minimum(client, airport_id):
    """mission create with default_transit_altitude < MIN_AGL returns 422."""
    response = client.post(
        "/api/v1/missions",
        json={
            "name": "Too Low",
            "airport_id": airport_id,
            "default_transit_altitude": 10.0,
        },
    )
    assert response.status_code == 422


def test_create_mission_rejects_non_positive_default_transit_altitude(client, airport_id):
    """mission create with default_transit_altitude <= 0 returns 422 via schema Field(gt=0)."""
    response = client.post(
        "/api/v1/missions",
        json={
            "name": "Zero Cruise",
            "airport_id": airport_id,
            "default_transit_altitude": 0,
        },
    )
    assert response.status_code == 422


def test_create_mission_rejects_default_transit_altitude_above_drone_max(client, airport_id):
    """mission create with default_transit_altitude above drone.max_altitude returns 422."""
    drone = client.post(
        "/api/v1/drone-profiles",
        json={
            "name": "Low Ceiling Drone",
            "max_speed": 20.0,
            "max_altitude": 100.0,
            "endurance_minutes": 40.0,
            "camera_frame_rate": 30,
            "sensor_fov": 84.0,
        },
    ).json()

    response = client.post(
        "/api/v1/missions",
        json={
            "name": "Above Ceiling",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_transit_altitude": 200.0,
        },
    )
    assert response.status_code == 422


def test_update_mission_default_transit_altitude_invalidates_trajectory(
    client, airport_id, db_session
):
    """updating default_transit_altitude on a PLANNED mission regresses it to DRAFT."""
    from app.models.enums import MissionStatus
    from app.models.mission import Mission

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Invalidate Cruise Test",
            "airport_id": airport_id,
            "default_transit_altitude": 60.0,
        },
    ).json()
    mission_id = mission["id"]

    # flip status directly so we don't need a full inspection fixture
    db_mission = db_session.query(Mission).filter(Mission.id == mission_id).first()
    db_mission.status = MissionStatus.PLANNED
    db_session.commit()

    response = client.put(
        f"/api/v1/missions/{mission_id}",
        json={"default_transit_altitude": 90.0},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "DRAFT"
    assert response.json()["default_transit_altitude"] == 90.0


def test_update_mission_rejects_invalid_default_transit_altitude(client, airport_id):
    """updating default_transit_altitude below MIN_AGL returns 422."""
    mission = client.post(
        "/api/v1/missions",
        json={"name": "Update Reject", "airport_id": airport_id},
    ).json()

    response = client.put(
        f"/api/v1/missions/{mission['id']}",
        json={"default_transit_altitude": 5.0},
    )
    assert response.status_code == 422


def test_duplicate_mission_preserves_default_transit_altitude(client, airport_id):
    """duplicate carries default_transit_altitude over to the new draft."""
    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Dup Cruise",
            "airport_id": airport_id,
            "default_transit_altitude": 75.0,
        },
    ).json()

    dup = client.post(f"/api/v1/missions/{mission['id']}/duplicate")
    assert dup.status_code == 201
    assert dup.json()["default_transit_altitude"] == 75.0
