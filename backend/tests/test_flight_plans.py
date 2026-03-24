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
