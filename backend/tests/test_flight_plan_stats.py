"""tests for enriched flight plan stats (issue #176)."""

from uuid import UUID

from app.schemas.flight_plan import FlightPlanResponse, InspectionFlightStats

# schema tests


def test_flight_plan_response_enriched_fields_default_to_none():
    """enriched stats fields default to none/empty when not provided."""
    data = {
        "id": "00000000-0000-0000-0000-000000000001",
        "mission_id": "00000000-0000-0000-0000-000000000002",
        "airport_id": "00000000-0000-0000-0000-000000000003",
        "is_validated": False,
        "waypoints": [],
    }
    resp = FlightPlanResponse(**data)
    assert resp.min_altitude_agl is None
    assert resp.max_altitude_agl is None
    assert resp.min_altitude_msl is None
    assert resp.max_altitude_msl is None
    assert resp.transit_speed is None
    assert resp.inspection_stats == []


def test_flight_plan_response_accepts_enriched_fields():
    """enriched stats fields are populated correctly."""
    data = {
        "id": "00000000-0000-0000-0000-000000000001",
        "mission_id": "00000000-0000-0000-0000-000000000002",
        "airport_id": "00000000-0000-0000-0000-000000000003",
        "is_validated": True,
        "waypoints": [],
        "min_altitude_agl": 10.5,
        "max_altitude_agl": 45.2,
        "min_altitude_msl": 310.5,
        "max_altitude_msl": 345.2,
        "transit_speed": 5.0,
        "inspection_stats": [
            {
                "inspection_id": "00000000-0000-0000-0000-000000000010",
                "min_altitude_agl": 12.0,
                "max_altitude_agl": 30.0,
                "min_altitude_msl": 312.0,
                "max_altitude_msl": 330.0,
                "waypoint_count": 8,
                "segment_duration": 42.5,
            }
        ],
    }
    resp = FlightPlanResponse(**data)
    assert resp.min_altitude_agl == 10.5
    assert resp.max_altitude_agl == 45.2
    assert resp.transit_speed == 5.0
    assert len(resp.inspection_stats) == 1
    assert resp.inspection_stats[0].waypoint_count == 8


def test_inspection_flight_stats_schema():
    """inspection flight stats schema validates correctly."""
    stats = InspectionFlightStats(
        inspection_id=UUID("00000000-0000-0000-0000-000000000010"),
        min_altitude_agl=5.0,
        max_altitude_agl=25.0,
        min_altitude_msl=305.0,
        max_altitude_msl=325.0,
        waypoint_count=12,
        segment_duration=None,
    )
    assert stats.waypoint_count == 12
    assert stats.segment_duration is None


# api-level test - verify enriched stats come back from get flight plan


def test_enriched_stats_in_get_flight_plan(client):
    """GET /flight-plan returns enriched altitude and speed stats."""
    from tests.data.trajectory import (
        DEFAULT_LANDING,
        DEFAULT_TAKEOFF,
        TRAJECTORY_AGL_PAYLOAD,
        TRAJECTORY_AIRPORT_PAYLOAD,
        TRAJECTORY_DRONE_PAYLOAD,
        TRAJECTORY_SURFACE_PAYLOAD,
        make_lha_payload,
    )

    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": "ZFPS"},
    ).json()
    airport_id = airport["id"]

    surface = client.post(
        f"/api/v1/airports/{airport_id}/surfaces",
        json=TRAJECTORY_SURFACE_PAYLOAD,
    ).json()
    surface_id = surface["id"]

    agl = client.post(
        f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls",
        json=TRAJECTORY_AGL_PAYLOAD,
    ).json()

    for i in range(1, 3):
        client.post(
            f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls/{agl['id']}/lhas",
            json=make_lha_payload(i),
        )

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    template = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": "Stats Test",
            "methods": ["HORIZONTAL_RANGE"],
            "target_agl_ids": [agl["id"]],
            "default_config": {"measurement_density": 3},
        },
    ).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Stats Test Mission",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 7.5,
            "takeoff_coordinate": DEFAULT_TAKEOFF,
            "landing_coordinate": DEFAULT_LANDING,
            "transit_agl": 10.0,
        },
    ).json()
    mission_id = mission["id"]

    client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template["id"], "method": "HORIZONTAL_RANGE"},
    )

    gen_resp = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert gen_resp.status_code == 200, gen_resp.text

    resp = client.get(f"/api/v1/missions/{mission_id}/flight-plan")
    assert resp.status_code == 200
    data = resp.json()

    assert data["min_altitude_agl"] is not None
    assert data["max_altitude_agl"] is not None
    assert data["min_altitude_msl"] is not None
    assert data["max_altitude_msl"] is not None
    assert data["min_altitude_agl"] <= data["max_altitude_agl"]
    assert data["min_altitude_msl"] <= data["max_altitude_msl"]
    assert data["transit_speed"] == 7.5
    assert isinstance(data["inspection_stats"], list)
    assert len(data["inspection_stats"]) >= 1

    insp_stat = data["inspection_stats"][0]
    assert insp_stat["waypoint_count"] > 0
    assert insp_stat["min_altitude_agl"] <= insp_stat["max_altitude_agl"]
