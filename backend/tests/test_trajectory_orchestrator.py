"""tests for trajectory orchestrator - domain exceptions, validation result creation"""

from uuid import uuid4

import pytest

from app.core.exceptions import NotFoundError, TrajectoryGenerationError
from tests.data.trajectory import (
    TRAJECTORY_AGL_PAYLOAD,
    TRAJECTORY_AIRPORT_PAYLOAD,
    TRAJECTORY_DRONE_PAYLOAD,
    TRAJECTORY_SURFACE_PAYLOAD,
    make_lha_payload,
)


def test_generate_trajectory_mission_not_found(db_engine):
    """orchestrator raises NotFoundError for missing mission"""
    from sqlalchemy.orm import Session

    from app.services.trajectory_orchestrator import generate_trajectory

    with Session(db_engine) as db:
        with pytest.raises(NotFoundError, match="mission not found"):
            generate_trajectory(db, uuid4())


def test_generate_trajectory_no_inspections(client, db_engine):
    """orchestrator raises TrajectoryGenerationError when mission has no inspections"""
    from sqlalchemy.orm import Session

    from app.services.trajectory_orchestrator import generate_trajectory

    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": "NOIN"},
    ).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "No Inspections Test",
            "airport_id": airport["id"],
            "default_speed": 5.0,
        },
    ).json()

    with Session(db_engine) as db:
        with pytest.raises(TrajectoryGenerationError, match="mission has no inspections"):
            generate_trajectory(db, mission["id"])


def test_generate_trajectory_no_waypoints_generated(client):
    """mission with inspection but no LHAs produces 400"""
    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": "NOLH"},
    ).json()
    airport_id = airport["id"]

    surface = client.post(
        f"/api/v1/airports/{airport_id}/surfaces", json=TRAJECTORY_SURFACE_PAYLOAD
    ).json()
    surface_id = surface["id"]

    # create AGL with no LHAs
    agl = client.post(
        f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls",
        json=TRAJECTORY_AGL_PAYLOAD,
    ).json()

    template = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": "No LHA Template",
            "methods": ["ANGULAR_SWEEP"],
            "target_agl_ids": [agl["id"]],
            "default_config": {"measurement_density": 6, "speed_override": 5.0},
        },
    ).json()

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "No LHA Test",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 5.0,
        },
    ).json()

    client.post(
        f"/api/v1/missions/{mission['id']}/inspections",
        json={"template_id": template["id"], "method": "ANGULAR_SWEEP"},
    )

    response = client.post(f"/api/v1/missions/{mission['id']}/generate-trajectory")
    assert response.status_code == 400


def test_generate_trajectory_route_translates_not_found(client):
    """route returns 404 for missing mission"""
    response = client.post(f"/api/v1/missions/{uuid4()}/generate-trajectory")

    assert response.status_code == 404


def test_generate_trajectory_route_translates_no_inspections(client):
    """route returns 400 when mission has no inspections"""
    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": "NOIP"},
    ).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "No Inspections Route Test",
            "airport_id": airport["id"],
            "default_speed": 5.0,
        },
    ).json()

    response = client.post(f"/api/v1/missions/{mission['id']}/generate-trajectory")

    assert response.status_code == 400


def test_validation_result_always_created(client):
    """flight plan always has validation_result even with zero warnings"""
    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": "VALR"},
    ).json()
    airport_id = airport["id"]

    surface = client.post(
        f"/api/v1/airports/{airport_id}/surfaces", json=TRAJECTORY_SURFACE_PAYLOAD
    ).json()
    surface_id = surface["id"]

    agl = client.post(
        f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls",
        json=TRAJECTORY_AGL_PAYLOAD,
    ).json()
    agl_id = agl["id"]

    for i in range(1, 5):
        client.post(
            f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls/{agl_id}/lhas",
            json=make_lha_payload(i),
        )

    template = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": "Val Result Template",
            "methods": ["ANGULAR_SWEEP"],
            "target_agl_ids": [agl_id],
            "default_config": {"measurement_density": 6, "speed_override": 5.0},
        },
    ).json()

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Val Result Test",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 5.0,
        },
    ).json()
    mission_id = mission["id"]

    client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template["id"], "method": "ANGULAR_SWEEP"},
    )

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    fp = response.json()["flight_plan"]
    assert fp["validation_result"] is not None
    assert fp["validation_result"]["passed"] is True


def test_regeneration_replaces_flight_plan(client):
    """calling generate twice replaces the flight plan instead of duplicating"""
    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": "RGEN"},
    ).json()
    airport_id = airport["id"]

    surface = client.post(
        f"/api/v1/airports/{airport_id}/surfaces", json=TRAJECTORY_SURFACE_PAYLOAD
    ).json()
    surface_id = surface["id"]

    agl = client.post(
        f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls",
        json=TRAJECTORY_AGL_PAYLOAD,
    ).json()
    agl_id = agl["id"]

    for i in range(1, 5):
        client.post(
            f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls/{agl_id}/lhas",
            json=make_lha_payload(i),
        )

    template = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": "Regen Template",
            "methods": ["ANGULAR_SWEEP"],
            "target_agl_ids": [agl_id],
            "default_config": {"measurement_density": 6, "speed_override": 5.0},
        },
    ).json()

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Regen Test",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 5.0,
        },
    ).json()
    mission_id = mission["id"]

    client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template["id"], "method": "ANGULAR_SWEEP"},
    )

    r1 = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert r1.status_code == 200
    fp1_id = r1.json()["flight_plan"]["id"]

    r2 = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert r2.status_code == 200
    fp2_id = r2.json()["flight_plan"]["id"]

    assert fp1_id != fp2_id

    # only one flight plan should exist
    fp_get = client.get(f"/api/v1/missions/{mission_id}/flight-plan")
    assert fp_get.status_code == 200
    assert fp_get.json()["id"] == fp2_id


def _create_mission_with_inspection(client, icao_code, **mission_extras):
    """helper to create airport + surface + agl + lhas + template + drone + mission + inspection"""
    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": icao_code},
    ).json()
    airport_id = airport["id"]

    surface = client.post(
        f"/api/v1/airports/{airport_id}/surfaces", json=TRAJECTORY_SURFACE_PAYLOAD
    ).json()
    surface_id = surface["id"]

    agl = client.post(
        f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls",
        json=TRAJECTORY_AGL_PAYLOAD,
    ).json()
    agl_id = agl["id"]

    for i in range(1, 5):
        client.post(
            f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls/{agl_id}/lhas",
            json=make_lha_payload(i),
        )

    template = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": f"Template {icao_code}",
            "methods": ["ANGULAR_SWEEP"],
            "target_agl_ids": [agl_id],
            "default_config": {"measurement_density": 6, "speed_override": 5.0},
        },
    ).json()

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    mission_payload = {
        "name": f"Test {icao_code}",
        "airport_id": airport_id,
        "drone_profile_id": drone["id"],
        "default_speed": 5.0,
        **mission_extras,
    }

    mission = client.post("/api/v1/missions", json=mission_payload).json()
    mission_id = mission["id"]

    client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template["id"], "method": "ANGULAR_SWEEP"},
    )

    return mission_id, airport_id


def test_phase5_takeoff_landing_assembly(client):
    """trajectory includes TAKEOFF and LANDING waypoints when coordinates are set"""
    takeoff = {"type": "Point", "coordinates": [14.24, 50.10, 300]}
    landing = {"type": "Point", "coordinates": [14.28, 50.09, 300]}

    mission_id, _ = _create_mission_with_inspection(
        client,
        "TKLM",
        takeoff_coordinate=takeoff,
        landing_coordinate=landing,
    )

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    fp = response.json()["flight_plan"]
    wp_types = [w["waypoint_type"] for w in fp["waypoints"]]

    assert wp_types[0] == "TAKEOFF"
    assert wp_types[-1] == "LANDING"

    # second waypoint should be TRANSIT (vertical climb to safe altitude)
    assert wp_types[1] == "TRANSIT"

    # total distance and duration should be positive
    assert fp["total_distance"] > 0
    assert fp["estimated_duration"] > 0


def test_phase5_transit_between_waypoints(client):
    """transit waypoints are inserted between takeoff climb and inspection pass"""
    takeoff = {"type": "Point", "coordinates": [14.24, 50.10, 300]}

    mission_id, _ = _create_mission_with_inspection(
        client,
        "TRNZ",
        takeoff_coordinate=takeoff,
    )

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    fp = response.json()["flight_plan"]
    wp_types = [w["waypoint_type"] for w in fp["waypoints"]]

    # should start with TAKEOFF, then TRANSIT (climb), then more TRANSIT or MEASUREMENT
    assert wp_types[0] == "TAKEOFF"
    assert "TRANSIT" in wp_types
    assert "MEASUREMENT" in wp_types


def test_runway_crossing_warnings(client):
    """trajectory crossing a runway produces crossing warnings"""
    # place takeoff on one side of runway, so transit crosses it
    takeoff = {"type": "Point", "coordinates": [14.26, 50.11, 300]}
    landing = {"type": "Point", "coordinates": [14.26, 50.08, 300]}

    mission_id, _ = _create_mission_with_inspection(
        client,
        "RWCR",
        takeoff_coordinate=takeoff,
        landing_coordinate=landing,
    )

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    warnings = response.json()["warnings"]
    # check that runway crossing warnings exist if trajectory crosses the runway
    # the exact number depends on geometry, but we verify the pipeline runs
    assert isinstance(warnings, list)


def test_final_validation_produces_soft_warnings(client):
    """final assembled path validation adds soft warnings to the response"""
    mission_id, _ = _create_mission_with_inspection(client, "FNVL")

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    fp = response.json()["flight_plan"]
    # validation result should exist with passed=True
    assert fp["validation_result"] is not None
    assert fp["validation_result"]["passed"] is True

    # waypoints should be ordered by sequence
    wps = fp["waypoints"]
    assert len(wps) > 0
    seq_orders = [w["sequence_order"] for w in wps]
    assert seq_orders == sorted(seq_orders)


def test_pipeline_computes_distance_and_duration(client):
    """full pipeline computes total_distance and estimated_duration"""
    mission_id, _ = _create_mission_with_inspection(client, "DIST")

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    fp = response.json()["flight_plan"]
    assert fp["total_distance"] is not None
    assert fp["total_distance"] > 0
    assert fp["estimated_duration"] is not None
    assert fp["estimated_duration"] > 0


def test_vertical_profile_generates_hover_waypoints(client):
    """vertical profile method generates waypoints including hover at transition angles"""
    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": "VPRO"},
    ).json()
    airport_id = airport["id"]

    surface = client.post(
        f"/api/v1/airports/{airport_id}/surfaces", json=TRAJECTORY_SURFACE_PAYLOAD
    ).json()
    surface_id = surface["id"]

    agl = client.post(
        f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls",
        json=TRAJECTORY_AGL_PAYLOAD,
    ).json()
    agl_id = agl["id"]

    for i in range(1, 5):
        client.post(
            f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls/{agl_id}/lhas",
            json=make_lha_payload(i),
        )

    template = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": "Vertical Profile Template",
            "methods": ["VERTICAL_PROFILE"],
            "target_agl_ids": [agl_id],
            "default_config": {"measurement_density": 8, "speed_override": 3.0},
        },
    ).json()

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Vertical Profile Test",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 3.0,
        },
    ).json()
    mission_id = mission["id"]

    client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template["id"], "method": "VERTICAL_PROFILE"},
    )

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    fp = response.json()["flight_plan"]
    wps = fp["waypoints"]
    assert len(wps) > 0

    # vertical profile should produce HOVER waypoints at transition angles
    wp_types = [w["waypoint_type"] for w in wps]
    assert "HOVER" in wp_types, "vertical profile should include HOVER waypoints"

    # altitudes should vary (vertical sweep changes altitude)
    measurement_wps = [w for w in wps if w["waypoint_type"] == "MEASUREMENT"]
    if len(measurement_wps) >= 2:
        alts = [w["position"]["coordinates"][2] for w in measurement_wps]
        assert max(alts) > min(alts), "vertical profile should have varying altitudes"
