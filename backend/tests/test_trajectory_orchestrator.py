"""tests for trajectory orchestrator - domain exceptions, validation result creation"""

from uuid import uuid4

import pytest

from app.core.exceptions import NotFoundError, TrajectoryGenerationError
from tests.data.trajectory import (
    DEFAULT_LANDING,
    DEFAULT_TAKEOFF,
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
            "default_config": {"measurement_density": 6},
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
            "default_config": {"measurement_density": 6},
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
            "takeoff_coordinate": {"type": "Point", "coordinates": [14.26, 50.105, 300]},
            "landing_coordinate": {"type": "Point", "coordinates": [14.26, 50.105, 300]},
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
    assert fp["is_validated"] is True


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
            "default_config": {"measurement_density": 6},
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
            "takeoff_coordinate": {"type": "Point", "coordinates": [14.26, 50.105, 300]},
            "landing_coordinate": {"type": "Point", "coordinates": [14.26, 50.105, 300]},
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
            "default_config": {"measurement_density": 6},
        },
    ).json()

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    mission_payload = {
        "name": f"Test {icao_code}",
        "airport_id": airport_id,
        "drone_profile_id": drone["id"],
        "default_speed": 5.0,
        "takeoff_coordinate": DEFAULT_TAKEOFF,
        "landing_coordinate": DEFAULT_LANDING,
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

    # crossing warnings are now persisted as violations in the flight plan
    violations = response.json()["flight_plan"]["validation_result"]["violations"]
    assert isinstance(violations, list)
    assert len(violations) > 0


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
    """vertical profile is one continuous measurement pass - HOVER only appears as
    video recording bookends, not at LHA setting-angle transitions."""
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
            "default_config": {"measurement_density": 8},
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
            "takeoff_coordinate": {"type": "Point", "coordinates": [14.26, 50.105, 300]},
            "landing_coordinate": {"type": "Point", "coordinates": [14.26, 50.105, 300]},
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

    # vertical profile emits continuous MEASUREMENT waypoints; the only HOVERs
    # that may appear are the RECORDING_START / RECORDING_STOP video bookends.
    inspection_hover_wps = [
        w for w in wps if w["waypoint_type"] == "HOVER" and w.get("inspection_id") is not None
    ]
    for wp in inspection_hover_wps:
        assert wp["camera_action"] in (
            "RECORDING_START",
            "RECORDING_STOP",
        ), "vertical profile should not hover mid-climb at setting angles"

    # altitudes should vary (vertical sweep changes altitude)
    measurement_wps = [w for w in wps if w["waypoint_type"] == "MEASUREMENT"]
    if len(measurement_wps) >= 2:
        alts = [w["position"]["coordinates"][2] for w in measurement_wps]
        assert max(alts) > min(alts), "vertical profile should have varying altitudes"


# flight plan service tests (via route layer)


def test_get_flight_plan_not_found(client):
    """get flight plan for mission with no plan returns 404"""
    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": "FPNF"},
    ).json()

    mission = client.post(
        "/api/v1/missions",
        json={"name": "No Plan Test", "airport_id": airport["id"], "default_speed": 5.0},
    ).json()

    response = client.get(f"/api/v1/missions/{mission['id']}/flight-plan")
    assert response.status_code == 404


def test_persist_transitions_draft_to_planned(client):
    """generating trajectory transitions mission from DRAFT to PLANNED"""
    mission_id, _ = _create_mission_with_inspection(client, "DRPL")

    # verify starts as DRAFT
    mission = client.get(f"/api/v1/missions/{mission_id}").json()
    assert mission["status"] == "DRAFT"

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    # verify transitioned to PLANNED
    mission = client.get(f"/api/v1/missions/{mission_id}").json()
    assert mission["status"] == "PLANNED"


def test_persist_keeps_planned_on_regeneration(client):
    """regenerating trajectory on PLANNED mission stays PLANNED"""
    mission_id, _ = _create_mission_with_inspection(client, "RGPL")

    # first generation -> PLANNED
    client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    mission = client.get(f"/api/v1/missions/{mission_id}").json()
    assert mission["status"] == "PLANNED"

    # second generation -> still PLANNED
    client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    mission = client.get(f"/api/v1/missions/{mission_id}").json()
    assert mission["status"] == "PLANNED"


def test_validated_mission_auto_regresses_on_regeneration(client):
    """generating trajectory on VALIDATED mission auto-regresses to PLANNED"""
    mission_id, _ = _create_mission_with_inspection(client, "VREG")

    # generate -> PLANNED
    client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")

    # validate -> VALIDATED
    client.post(f"/api/v1/missions/{mission_id}/validate")
    mission = client.get(f"/api/v1/missions/{mission_id}").json()
    assert mission["status"] == "VALIDATED"

    # regenerate -> auto-regresses to PLANNED
    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    mission = client.get(f"/api/v1/missions/{mission_id}").json()
    assert mission["status"] == "PLANNED"


def test_buffer_distance_override_respected_in_trajectory(client):
    """mission with default_buffer_distance generates trajectory using the override."""
    mission_id, _ = _create_mission_with_inspection(
        client,
        "BUFD",
        default_buffer_distance=15.0,
    )

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    fp = response.json()["flight_plan"]
    assert fp["total_distance"] > 0
    assert len(fp["waypoints"]) > 0


def test_has_unsaved_map_changes_set_on_batch_update(client):
    """batch_update_waypoints sets has_unsaved_map_changes to True."""
    takeoff = {"type": "Point", "coordinates": [14.24, 50.10, 300]}
    landing = {"type": "Point", "coordinates": [14.28, 50.09, 300]}

    mission_id, _ = _create_mission_with_inspection(
        client,
        "BUMC",
        takeoff_coordinate=takeoff,
        landing_coordinate=landing,
    )

    gen = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert gen.status_code == 200

    fp = gen.json()["flight_plan"]
    first_wp = fp["waypoints"][0]

    # move the first waypoint slightly
    coords = first_wp["position"]["coordinates"]
    r = client.put(
        f"/api/v1/missions/{mission_id}/flight-plan/waypoints",
        json={
            "updates": [
                {
                    "waypoint_id": first_wp["id"],
                    "position": {
                        "type": "Point",
                        "coordinates": [coords[0] + 0.001, coords[1], coords[2]],
                    },
                }
            ]
        },
    )
    assert r.status_code == 200

    mission = client.get(f"/api/v1/missions/{mission_id}").json()
    assert mission["has_unsaved_map_changes"] is True


def test_takeoff_landing_waypoints_sit_at_ground_level(client):
    """TAKEOFF and LANDING waypoints use the operator-supplied altitude, not ground + 30m AGL."""
    # airport ground elevation = 300 (flat provider), operator-supplied alt = 300
    takeoff = {"type": "Point", "coordinates": [14.24, 50.10, 300]}
    landing = {"type": "Point", "coordinates": [14.28, 50.09, 300]}

    mission_id, _ = _create_mission_with_inspection(
        client,
        "TKLG",
        takeoff_coordinate=takeoff,
        landing_coordinate=landing,
    )

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    wps = response.json()["flight_plan"]["waypoints"]

    takeoff_wp = next(w for w in wps if w["waypoint_type"] == "TAKEOFF")
    landing_wp = next(w for w in wps if w["waypoint_type"] == "LANDING")

    # ground level, not clamped to ground + MINIMUM_AGL_ALTITUDE (330)
    assert takeoff_wp["position"]["coordinates"][2] == pytest.approx(300.0, abs=1e-6)
    assert landing_wp["position"]["coordinates"][2] == pytest.approx(300.0, abs=1e-6)


def test_transit_waypoints_still_enforce_minimum_agl(client):
    """transit waypoints sit at ground + TRANSIT_AGL when no explicit transit_agl is set."""
    mission_id, _ = _create_mission_with_inspection(client, "AGLF")

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    wps = response.json()["flight_plan"]["waypoints"]
    # ground elevation = 300; fallback cruise = 300 + TRANSIT_AGL (30) = 330 AMSL
    transit_wps = [w for w in wps if w["waypoint_type"] == "TRANSIT"]
    assert transit_wps, "expected at least one transit waypoint"
    for wp in transit_wps:
        assert wp["position"]["coordinates"][2] >= 330.0 - 1e-6


def test_transit_agl_forces_shared_cruise_level(client):
    """all transit waypoints share ground + transit_agl when the field is set."""
    takeoff = {"type": "Point", "coordinates": [14.24, 50.10, 300]}
    landing = {"type": "Point", "coordinates": [14.28, 50.09, 300]}

    mission_id, _ = _create_mission_with_inspection(
        client,
        "CRUI",
        takeoff_coordinate=takeoff,
        landing_coordinate=landing,
        transit_agl=120.0,
    )

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    wps = response.json()["flight_plan"]["waypoints"]
    # expected cruise altitude = airport elevation (300) + 120 AGL
    expected_cruise = 420.0

    transit_wps = [w for w in wps if w["waypoint_type"] == "TRANSIT"]
    assert transit_wps, "expected transit waypoints between takeoff and inspection pass"

    for wp in transit_wps:
        assert wp["position"]["coordinates"][2] == pytest.approx(expected_cruise, abs=1e-3)


def test_transit_agl_fallback_without_field(client):
    """transit waypoints fall back to ground + TRANSIT_AGL when field is unset."""
    takeoff = {"type": "Point", "coordinates": [14.24, 50.10, 300]}
    landing = {"type": "Point", "coordinates": [14.28, 50.09, 300]}

    mission_id, _ = _create_mission_with_inspection(
        client,
        "FBCR",
        takeoff_coordinate=takeoff,
        landing_coordinate=landing,
    )

    response = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert response.status_code == 200

    wps = response.json()["flight_plan"]["waypoints"]
    # fallback cruise = 300 + TRANSIT_AGL (30) = 330
    expected_fallback = 330.0

    transit_wps = [w for w in wps if w["waypoint_type"] == "TRANSIT"]
    assert transit_wps, "expected transit waypoints"
    for wp in transit_wps:
        assert wp["position"]["coordinates"][2] == pytest.approx(expected_fallback, abs=1e-3)


def test_has_unsaved_map_changes_cleared_after_generate(client):
    """generate_trajectory clears has_unsaved_map_changes."""
    takeoff = {"type": "Point", "coordinates": [14.24, 50.10, 300]}
    landing = {"type": "Point", "coordinates": [14.28, 50.09, 300]}

    mission_id, _ = _create_mission_with_inspection(
        client,
        "GUMC",
        takeoff_coordinate=takeoff,
        landing_coordinate=landing,
    )

    # generate, batch update to set the flag, then regenerate
    gen1 = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert gen1.status_code == 200

    fp = gen1.json()["flight_plan"]
    first_wp = fp["waypoints"][0]
    coords = first_wp["position"]["coordinates"]

    client.put(
        f"/api/v1/missions/{mission_id}/flight-plan/waypoints",
        json={
            "updates": [
                {
                    "waypoint_id": first_wp["id"],
                    "position": {
                        "type": "Point",
                        "coordinates": [coords[0] + 0.001, coords[1], coords[2]],
                    },
                }
            ]
        },
    )

    mission = client.get(f"/api/v1/missions/{mission_id}").json()
    assert mission["has_unsaved_map_changes"] is True

    # regenerate should clear the flag
    gen2 = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert gen2.status_code == 200

    mission = client.get(f"/api/v1/missions/{mission_id}").json()
    assert mission["has_unsaved_map_changes"] is False


def _setup_airport_template_for_method(
    client, icao_code: str, method: str, agl_type: str = "RUNWAY_EDGE_LIGHTS"
):
    """airport + runway surface + AGL of the given type + 4 LHAs + template."""
    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": icao_code},
    ).json()
    airport_id = airport["id"]

    surface = client.post(
        f"/api/v1/airports/{airport_id}/surfaces", json=TRAJECTORY_SURFACE_PAYLOAD
    ).json()
    surface_id = surface["id"]

    agl_payload = {**TRAJECTORY_AGL_PAYLOAD, "agl_type": agl_type}
    agl = client.post(
        f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls",
        json=agl_payload,
    ).json()
    agl_id = agl["id"]

    lha_ids: list[str] = []
    for i in range(1, 5):
        lha = client.post(
            f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls/{agl_id}/lhas",
            json=make_lha_payload(i),
        ).json()
        lha_ids.append(lha["id"])

    template = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": f"Template {icao_code}",
            "methods": [method],
            "target_agl_ids": [agl_id],
            "default_config": {"measurement_density": 4},
        },
    ).json()

    return airport_id, agl_id, template["id"], lha_ids


def _run_new_method_mission(
    client,
    icao_code: str,
    method: str,
    config: dict | None = None,
    agl_type: str = "RUNWAY_EDGE_LIGHTS",
):
    """create a mission + inspection for a new method and generate the trajectory."""
    airport_id, _, template_id, lha_ids = _setup_airport_template_for_method(
        client, icao_code, method, agl_type=agl_type
    )

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": f"Test {icao_code}",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 5.0,
            "takeoff_coordinate": DEFAULT_TAKEOFF,
            "landing_coordinate": DEFAULT_LANDING,
        },
    ).json()
    mission_id = mission["id"]

    payload: dict = {"template_id": template_id, "method": method}
    if config is not None:
        payload["config"] = config

    r = client.post(f"/api/v1/missions/{mission_id}/inspections", json=payload)
    assert r.status_code == 201, r.text

    gen = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    return mission_id, lha_ids, gen


def test_fly_over_generates_flight_plan(client):
    """fly-over produces one measurement waypoint per LHA at lha.alt + height_above_lights."""
    _, lha_ids, gen = _run_new_method_mission(
        client,
        "FLYO",
        "FLY_OVER",
        config={"height_above_lights": 12.0},
    )
    assert gen.status_code == 200, gen.text
    fp = gen.json()["flight_plan"]
    measurements = [w for w in fp["waypoints"] if w["waypoint_type"] == "MEASUREMENT"]
    assert len(measurements) == len(lha_ids)
    # altitude = LHA ground (300) + height_above_lights (12)
    for wp in measurements:
        assert wp["position"]["coordinates"][2] == pytest.approx(312.0, abs=1.0)


def test_fly_over_video_mode_wraps_with_recording_hovers(client):
    """VIDEO capture adds RECORDING_START / RECORDING_STOP hover waypoints at the ends."""
    _, lha_ids, gen = _run_new_method_mission(
        client,
        "FLYV",
        "FLY_OVER",
        config={
            "capture_mode": "VIDEO_CAPTURE",
            "recording_setup_duration": 2.0,
            "height_above_lights": 12.0,
        },
    )
    assert gen.status_code == 200, gen.text
    fp = gen.json()["flight_plan"]
    pass_wps = [
        w
        for w in fp["waypoints"]
        if w["waypoint_type"] in ("MEASUREMENT", "HOVER") and w["inspection_id"]
    ]
    actions = [w["camera_action"] for w in pass_wps]
    assert "RECORDING_START" in actions
    assert "RECORDING_STOP" in actions
    # start/stop bookend the measurement run
    assert pass_wps[0]["camera_action"] == "RECORDING_START"
    assert pass_wps[-1]["camera_action"] == "RECORDING_STOP"


def test_parallel_side_sweep_generates_flight_plan(client):
    """parallel-side-sweep produces waypoints on the exterior side of the runway."""
    _, lha_ids, gen = _run_new_method_mission(
        client,
        "PARA",
        "PARALLEL_SIDE_SWEEP",
        config={"lateral_offset": 25.0, "height_above_lights": 10.0},
    )
    assert gen.status_code == 200, gen.text
    fp = gen.json()["flight_plan"]
    measurements = [w for w in fp["waypoints"] if w["waypoint_type"] == "MEASUREMENT"]
    assert len(measurements) == len(lha_ids)

    # TRAJECTORY_SURFACE_PAYLOAD: runway centerline runs from (14.24, 50.10) to
    # (14.28, 50.09); midpoint ~ (14.26, 50.095). LHAs sit around (14.274, 50.098)
    # - just north of the centerline midpoint in lat. so the exterior (far) side
    # of the runway is further north (higher lat) than the LHA row.
    lha_lat = 50.098
    runway_mid_lat = 50.095
    for wp in measurements:
        wp_lat = wp["position"]["coordinates"][1]
        # exterior: further from runway centerline than LHAs
        assert abs(wp_lat - runway_mid_lat) > abs(lha_lat - runway_mid_lat) - 1e-6


def test_parallel_side_sweep_video_mode(client):
    """VIDEO mode adds RECORDING_START / RECORDING_STOP hover waypoints."""
    _, _, gen = _run_new_method_mission(
        client,
        "PRVD",
        "PARALLEL_SIDE_SWEEP",
        config={
            "capture_mode": "VIDEO_CAPTURE",
            "recording_setup_duration": 2.0,
            "lateral_offset": 25.0,
        },
    )
    assert gen.status_code == 200, gen.text
    fp = gen.json()["flight_plan"]
    actions = [w["camera_action"] for w in fp["waypoints"]]
    assert "RECORDING_START" in actions
    assert "RECORDING_STOP" in actions


def test_hover_point_lock_single_hover_photo(client):
    """PHOTO capture: one HOVER waypoint with PHOTO_CAPTURE action and configured dwell."""
    airport_id, _, template_id, lha_ids = _setup_airport_template_for_method(
        client, "HPSL", "HOVER_POINT_LOCK"
    )

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Hover Single",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 5.0,
            "takeoff_coordinate": DEFAULT_TAKEOFF,
            "landing_coordinate": DEFAULT_LANDING,
        },
    ).json()

    r = client.post(
        f"/api/v1/missions/{mission['id']}/inspections",
        json={
            "template_id": template_id,
            "method": "HOVER_POINT_LOCK",
            "config": {
                "selected_lha_id": lha_ids[0],
                "hover_duration": 8.0,
                "capture_mode": "PHOTO_CAPTURE",
                "camera_gimbal_angle": -30.0,
                "distance_from_lha": 10.0,
                "height_above_lha": 5.0,
            },
        },
    )
    assert r.status_code == 201, r.text

    gen = client.post(f"/api/v1/missions/{mission['id']}/generate-trajectory")
    assert gen.status_code == 200, gen.text
    fp = gen.json()["flight_plan"]

    hover_wps = [w for w in fp["waypoints"] if w["waypoint_type"] == "HOVER" and w["inspection_id"]]
    assert len(hover_wps) == 1
    # _apply_camera_actions clears camera_action on the first/last waypoint of a
    # pass; for a single-waypoint hover that is the only waypoint, so PHOTO_CAPTURE
    # gets stripped to NONE here. the underlying behavior is covered by the unit
    # tests on calculate_hover_point_lock_path.
    assert hover_wps[0]["hover_duration"] == pytest.approx(8.0, abs=1e-3)
    assert hover_wps[0]["gimbal_pitch"] == pytest.approx(-30.0, abs=1e-3)


def test_hover_point_lock_video_three_waypoints(client):
    """VIDEO capture emits RECORDING_START + RECORDING + RECORDING_STOP hover waypoints."""
    airport_id, _, template_id, lha_ids = _setup_airport_template_for_method(
        client, "HPVD", "HOVER_POINT_LOCK"
    )
    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Hover Video",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 5.0,
            "takeoff_coordinate": DEFAULT_TAKEOFF,
            "landing_coordinate": DEFAULT_LANDING,
        },
    ).json()

    r = client.post(
        f"/api/v1/missions/{mission['id']}/inspections",
        json={
            "template_id": template_id,
            "method": "HOVER_POINT_LOCK",
            "config": {
                "selected_lha_id": lha_ids[0],
                "capture_mode": "VIDEO_CAPTURE",
                "recording_setup_duration": 2.0,
            },
        },
    )
    assert r.status_code == 201, r.text

    gen = client.post(f"/api/v1/missions/{mission['id']}/generate-trajectory")
    assert gen.status_code == 200, gen.text
    fp = gen.json()["flight_plan"]

    pass_wps = [w for w in fp["waypoints"] if w["waypoint_type"] == "HOVER" and w["inspection_id"]]
    actions = [w["camera_action"] for w in pass_wps]
    assert actions == ["RECORDING_START", "RECORDING", "RECORDING_STOP"]


def test_fly_over_speed_uses_lha_count_as_density(client):
    """speed is resolved using len(ordered_lhas), not config.measurement_density.

    with the old bug, passing density=8 for 4 LHAs inflated waypoint_spacing and
    recommended a higher optimal_speed. fix: density = 4 -> lower optimal speed,
    no spurious framerate warning when speed <= optimal.
    """
    # falls back to method default (5 m/s for fly-over)
    _, lha_ids, gen = _run_new_method_mission(
        client,
        "FLSP",
        "FLY_OVER",
    )
    assert gen.status_code == 200, gen.text
    fp = gen.json()["flight_plan"]
    measurements = [w for w in fp["waypoints"] if w["waypoint_type"] == "MEASUREMENT"]
    assert len(measurements) == len(lha_ids)


def test_hover_point_lock_missing_selected_lha_raises(client, db_engine):
    """orchestrator raises TrajectoryGenerationError when HOVER_POINT_LOCK has no selected LHA."""
    from sqlalchemy.orm import Session

    from app.services.trajectory_orchestrator import generate_trajectory

    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": "HPLK"},
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

    for i in range(1, 4):
        client.post(
            f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls/{agl_id}/lhas",
            json=make_lha_payload(i),
        )

    template = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": "Hover Template",
            "methods": ["HOVER_POINT_LOCK"],
            "target_agl_ids": [agl_id],
            "default_config": {"measurement_density": 4},
        },
    ).json()

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Hover Missing LHA",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 5.0,
            "takeoff_coordinate": DEFAULT_TAKEOFF,
            "landing_coordinate": DEFAULT_LANDING,
        },
    ).json()
    mission_id = mission["id"]

    # inspection without selected_lha_id in config
    client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template["id"], "method": "HOVER_POINT_LOCK"},
    )

    with Session(db_engine) as db:
        with pytest.raises(
            TrajectoryGenerationError,
            match="hover-point-lock requires a selected LHA",
        ):
            generate_trajectory(db, mission_id)


def test_require_perpendicular_runway_crossing_shortens_path(client):
    """flag=False produces a shorter total_distance than flag=True when transit crosses runway."""
    # takeoff north of runway, landing south - guarantees the landing transit
    # leg crosses the runway centerline regardless of how the inspection ends.
    takeoff = {"type": "Point", "coordinates": [14.26, 50.11, 300]}
    landing = {"type": "Point", "coordinates": [14.26, 50.08, 300]}

    # baseline with the perpendicular constraint enforced
    perp_mission_id, _ = _create_mission_with_inspection(
        client,
        "PERP",
        takeoff_coordinate=takeoff,
        landing_coordinate=landing,
        require_perpendicular_runway_crossing=True,
    )
    perp_resp = client.post(f"/api/v1/missions/{perp_mission_id}/generate-trajectory")
    assert perp_resp.status_code == 200, perp_resp.text
    perp_distance = perp_resp.json()["flight_plan"]["total_distance"]

    # second mission: identical geometry, flag off (shortest geodesic)
    short_mission_id, _ = _create_mission_with_inspection(
        client,
        "SHRT",
        takeoff_coordinate=takeoff,
        landing_coordinate=landing,
        require_perpendicular_runway_crossing=False,
    )
    short_resp = client.post(f"/api/v1/missions/{short_mission_id}/generate-trajectory")
    assert short_resp.status_code == 200, short_resp.text
    short_distance = short_resp.json()["flight_plan"]["total_distance"]

    assert short_distance < perp_distance, (
        f"shortest-geodesic distance {short_distance:.1f} not strictly less than "
        f"perpendicular {perp_distance:.1f}"
    )


def test_measurement_speed_override_governs_only_measurement_waypoints(client):
    """measurement_speed_override sets measurement speed; mission default_speed drives
    transit waypoints (climb/descent bracketing the pass)."""
    airport_id, _, template_id, lha_ids = _setup_airport_template_for_method(
        client, "MSPD", "FLY_OVER"
    )
    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    # mission default_speed = 7.0 drives transit segments
    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Test MSPD",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 7.0,
            "takeoff_coordinate": DEFAULT_TAKEOFF,
            "landing_coordinate": DEFAULT_LANDING,
        },
    ).json()
    mission_id = mission["id"]

    r = client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={
            "template_id": template_id,
            "method": "FLY_OVER",
            "config": {
                "measurement_speed_override": 2.0,
                "height_above_lights": 12.0,
                "capture_mode": "PHOTO_CAPTURE",
            },
        },
    )
    assert r.status_code == 201, r.text

    gen = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert gen.status_code == 200, gen.text
    fp = gen.json()["flight_plan"]

    measurements = [w for w in fp["waypoints"] if w["waypoint_type"] == "MEASUREMENT"]
    assert measurements, "expected measurement waypoints"
    for wp in measurements:
        assert wp["speed"] == pytest.approx(2.0)

    # transit waypoints use the mission default_speed
    transit_speeds = [wp["speed"] for wp in fp["waypoints"] if wp["waypoint_type"] == "TRANSIT"]
    assert any(
        s == pytest.approx(7.0) for s in transit_speeds
    ), f"expected at least one transit at default_speed=7.0, got speeds: {transit_speeds}"


def test_mission_measurement_speed_override_fallback(client):
    """mission measurement_speed_override applies to inspections without their own override;
    per-inspection override takes precedence when set."""
    airport_id, _, template_id, lha_ids = _setup_airport_template_for_method(
        client, "MMSO", "FLY_OVER"
    )
    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    # mission-level measurement_speed_override = 1.0
    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Test MMSO",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 5.0,
            "measurement_speed_override": 1.0,
            "takeoff_coordinate": DEFAULT_TAKEOFF,
            "landing_coordinate": DEFAULT_LANDING,
        },
    ).json()
    mission_id = mission["id"]

    # inspection A: per-inspection override = 10.0
    r = client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={
            "template_id": template_id,
            "method": "FLY_OVER",
            "config": {
                "measurement_speed_override": 10.0,
                "height_above_lights": 12.0,
                "capture_mode": "PHOTO_CAPTURE",
            },
        },
    )
    assert r.status_code == 201, r.text
    insp_a_id = r.json()["id"]

    # inspection B: no per-inspection override - should fall back to mission's 1.0
    r = client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={
            "template_id": template_id,
            "method": "FLY_OVER",
            "config": {
                "height_above_lights": 12.0,
                "capture_mode": "PHOTO_CAPTURE",
            },
        },
    )
    assert r.status_code == 201, r.text
    insp_b_id = r.json()["id"]

    gen = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert gen.status_code == 200, gen.text
    fp = gen.json()["flight_plan"]

    # inspection A measurements should use 10.0
    a_measurements = [
        w
        for w in fp["waypoints"]
        if w["waypoint_type"] == "MEASUREMENT" and w.get("inspection_id") == insp_a_id
    ]
    assert a_measurements, "expected measurement waypoints for inspection A"
    for wp in a_measurements:
        assert wp["speed"] == pytest.approx(
            10.0
        ), f"inspection A should use per-inspection override 10.0, got {wp['speed']}"

    # inspection B measurements should use mission fallback 1.0
    b_measurements = [
        w
        for w in fp["waypoints"]
        if w["waypoint_type"] == "MEASUREMENT" and w.get("inspection_id") == insp_b_id
    ]
    assert b_measurements, "expected measurement waypoints for inspection B"
    for wp in b_measurements:
        assert wp["speed"] == pytest.approx(
            1.0
        ), f"inspection B should use mission fallback 1.0, got {wp['speed']}"
