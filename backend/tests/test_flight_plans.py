from uuid import uuid4

import pytest

from tests.data.missions import MISSION_AIRPORT_PAYLOAD

DRONE_PROFILE_PAYLOAD = {
    "name": "FP Test Drone",
    "manufacturer": "DJI",
    "model": "Matrice 300",
    "max_speed": 23.0,
    "max_climb_rate": 6.0,
    "max_altitude": 500.0,
    "battery_capacity": 5935.0,
    "endurance_minutes": 55.0,
    "camera_resolution": "20MP",
    "camera_frame_rate": 30,
    "sensor_fov": 84.0,
    "weight": 6.3,
}


@pytest.fixture(scope="module")
def fp_airport_id(client):
    """create a test airport for flight plan tests."""
    payload = {**MISSION_AIRPORT_PAYLOAD, "icao_code": "LKFP"}
    r = client.post("/api/v1/airports", json=payload)
    return r.json()["id"]


@pytest.fixture(scope="module")
def fp_drone_id(client):
    """create a test drone profile."""
    r = client.post("/api/v1/drone-profiles", json=DRONE_PROFILE_PAYLOAD)
    return r.json()["id"]


@pytest.fixture(scope="module")
def fp_mission_id(client, fp_airport_id, fp_drone_id):
    """create a mission for flight plan tests."""
    r = client.post(
        "/api/v1/missions",
        json={
            "name": "FP Test Mission",
            "airport_id": fp_airport_id,
            "drone_profile_id": fp_drone_id,
            "takeoff_coordinate": {
                "type": "Point",
                "coordinates": [18.11, 49.69, 260.0],
            },
            "landing_coordinate": {
                "type": "Point",
                "coordinates": [18.12, 49.69, 260.0],
            },
        },
    )
    return r.json()["id"]


def test_generate_trajectory_without_coordinates(client, fp_airport_id):
    """generate trajectory returns 400 when takeoff/landing coordinates are missing."""
    r = client.post(
        "/api/v1/missions",
        json={"name": "No Coords Mission", "airport_id": fp_airport_id},
    )
    mission_id = r.json()["id"]

    r = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert r.status_code == 400
    assert "Takeoff/landing coordinates must be set" in r.json()["detail"]


def test_generate_trajectory_without_landing_coordinate(client, fp_airport_id):
    """generate trajectory returns 400 when only takeoff is set."""
    r = client.post(
        "/api/v1/missions",
        json={
            "name": "No Landing Mission",
            "airport_id": fp_airport_id,
            "takeoff_coordinate": {"type": "Point", "coordinates": [18.11, 49.69, 260.0]},
        },
    )
    mission_id = r.json()["id"]

    r = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert r.status_code == 400
    assert "Takeoff/landing coordinates must be set" in r.json()["detail"]


def test_batch_update_no_flight_plan(client, fp_mission_id):
    """batch update returns 404 when no flight plan exists."""
    r = client.put(
        f"/api/v1/missions/{fp_mission_id}/flight-plan/waypoints",
        json={"updates": []},
    )
    assert r.status_code == 404


def test_batch_update_mission_not_found(client):
    """batch update returns 404 for non-existent mission."""
    fake_id = "00000000-0000-0000-0000-000000000000"
    r = client.put(
        f"/api/v1/missions/{fake_id}/flight-plan/waypoints",
        json={"updates": []},
    )
    assert r.status_code == 404


def test_batch_update_invalid_waypoint(client, fp_mission_id):
    """batch update returns 404 for non-existent waypoint id."""
    # generate trajectory first so we have a flight plan
    gen_r = client.post(f"/api/v1/missions/{fp_mission_id}/generate-trajectory")
    if gen_r.status_code != 200:
        pytest.skip("trajectory generation not available without inspections")

    fake_wp_id = "00000000-0000-0000-0000-000000000001"
    r = client.put(
        f"/api/v1/missions/{fp_mission_id}/flight-plan/waypoints",
        json={
            "updates": [
                {
                    "waypoint_id": fake_wp_id,
                    "position": {
                        "type": "Point",
                        "coordinates": [18.11, 49.69, 265.0],
                    },
                }
            ]
        },
    )
    assert r.status_code == 404


# persist_flight_plan integration tests


def test_persist_creates_all_category_types(db_session, fp_airport_id):
    """persist_flight_plan stores warnings, violations, and suggestions with correct categories."""
    from app.models.flight_plan import ValidationViolation
    from app.models.mission import Mission
    from app.services.flight_plan_service import persist_flight_plan

    mission = Mission(
        id=uuid4(),
        name="persist category test",
        airport_id=fp_airport_id,
        status="DRAFT",
    )
    db_session.add(mission)
    db_session.flush()

    fp = persist_flight_plan(
        db_session,
        mission,
        all_waypoints=[],
        warnings=["speed too high"],
        total_distance=100.0,
        estimated_duration=60.0,
        violations=["altitude exceeded"],
        suggestions=["no density override"],
    )

    violations = (
        db_session.query(ValidationViolation)
        .filter(ValidationViolation.validation_result_id == fp.validation_result.id)
        .all()
    )

    cats = {v.category for v in violations}
    assert cats == {"warning", "violation", "suggestion"}

    warning = next(v for v in violations if v.category == "warning")
    assert warning.message == "speed too high"

    violation = next(v for v in violations if v.category == "violation")
    assert violation.message == "altitude exceeded"

    suggestion = next(v for v in violations if v.category == "suggestion")
    assert suggestion.message == "no density override"

    assert fp.validation_result.passed is False

    db_session.rollback()


def test_persist_passed_true_without_violations(db_session, fp_airport_id):
    """persist_flight_plan sets passed=True when no violations are provided."""
    from app.models.mission import Mission
    from app.services.flight_plan_service import persist_flight_plan

    mission = Mission(
        id=uuid4(),
        name="persist no violations test",
        airport_id=fp_airport_id,
        status="DRAFT",
    )
    db_session.add(mission)
    db_session.flush()

    fp = persist_flight_plan(
        db_session,
        mission,
        all_waypoints=[],
        warnings=["minor warning"],
        total_distance=50.0,
        estimated_duration=30.0,
    )

    assert fp.validation_result.passed is True

    db_session.rollback()
