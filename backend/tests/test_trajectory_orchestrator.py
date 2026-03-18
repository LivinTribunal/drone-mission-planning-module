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
