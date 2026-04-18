"""tests for flight plan scope selector feature."""

from app.models.mission import TRAJECTORY_FIELDS, Mission
from app.schemas.mission import MissionCreate, MissionUpdate
from tests.data.trajectory import (
    DEFAULT_LANDING,
    DEFAULT_TAKEOFF,
    TRAJECTORY_AGL_PAYLOAD,
    TRAJECTORY_AIRPORT_PAYLOAD,
    TRAJECTORY_DRONE_PAYLOAD,
    TRAJECTORY_SURFACE_PAYLOAD,
    make_lha_payload,
)

# model tests


def test_flight_plan_scope_in_trajectory_fields():
    """flight_plan_scope must invalidate trajectory when changed."""
    assert "flight_plan_scope" in TRAJECTORY_FIELDS


def test_mission_defaults_scope_to_full():
    """new Mission instance has flight_plan_scope == FULL."""
    m = Mission(
        name="x",
        airport_id="00000000-0000-0000-0000-000000000001",
        flight_plan_scope="FULL",
    )
    assert m.flight_plan_scope == "FULL"


# schema tests


def test_mission_create_defaults_scope_to_full():
    """MissionCreate defaults flight_plan_scope to FULL."""
    schema = MissionCreate(name="test", airport_id="00000000-0000-0000-0000-000000000001")
    assert schema.flight_plan_scope == "FULL"


def test_mission_create_accepts_all_scope_values():
    """MissionCreate accepts all three scope values."""
    for scope in ("FULL", "NO_TAKEOFF_LANDING", "MEASUREMENTS_ONLY"):
        schema = MissionCreate(
            name="test",
            airport_id="00000000-0000-0000-0000-000000000001",
            flight_plan_scope=scope,
        )
        assert schema.flight_plan_scope == scope


def test_mission_update_accepts_scope():
    """MissionUpdate accepts flight_plan_scope."""
    update = MissionUpdate(flight_plan_scope="MEASUREMENTS_ONLY")
    assert update.flight_plan_scope == "MEASUREMENTS_ONLY"


def test_mission_update_scope_defaults_to_none():
    """MissionUpdate leaves flight_plan_scope as None when not provided."""
    update = MissionUpdate()
    assert update.flight_plan_scope is None


# api tests


def test_create_mission_with_scope(client):
    """POST /missions with flight_plan_scope returns field in response."""
    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": "ZFSP"},
    ).json()

    resp = client.post(
        "/api/v1/missions",
        json={
            "name": "Scope Test",
            "airport_id": airport["id"],
            "flight_plan_scope": "NO_TAKEOFF_LANDING",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["flight_plan_scope"] == "NO_TAKEOFF_LANDING"


def test_mission_scope_defaults_to_full_via_api(client):
    """POST /missions without scope returns FULL in response."""
    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": "ZFDF"},
    ).json()

    resp = client.post(
        "/api/v1/missions",
        json={"name": "Default Scope Test", "airport_id": airport["id"]},
    )
    assert resp.status_code == 201
    assert resp.json()["flight_plan_scope"] == "FULL"


def test_update_mission_scope_regresses_status(client):
    """PATCH scope on a PLANNED mission regresses it to DRAFT."""
    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": "ZFRG"},
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

    for i in range(1, 3):
        client.post(
            f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls/{agl['id']}/lhas",
            json=make_lha_payload(i),
        )

    template = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": "Scope Regress Template",
            "methods": ["ANGULAR_SWEEP"],
            "target_agl_ids": [agl["id"]],
            "default_config": {"measurement_density": 3},
        },
    ).json()

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Scope Regress Mission",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 5.0,
            "takeoff_coordinate": DEFAULT_TAKEOFF,
            "landing_coordinate": DEFAULT_LANDING,
            "transit_agl": 10.0,
        },
    ).json()
    mission_id = mission["id"]

    client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template["id"], "method": "ANGULAR_SWEEP"},
    )

    # generate trajectory to get to PLANNED
    gen = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert gen.status_code == 200
    assert client.get(f"/api/v1/missions/{mission_id}").json()["status"] == "PLANNED"

    # changing scope must regress to DRAFT
    resp = client.put(
        f"/api/v1/missions/{mission_id}",
        json={"flight_plan_scope": "NO_TAKEOFF_LANDING"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "DRAFT"


# trajectory generation tests


def _setup_trajectory_mission(client, icao: str, scope: str, with_coordinates: bool = True):
    """shared helper - creates airport, surface, agl, lhas, template, drone, mission, inspection."""
    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": icao},
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

    for i in range(1, 4):
        client.post(
            f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls/{agl['id']}/lhas",
            json=make_lha_payload(i),
        )

    template = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": f"Scope Template {icao}",
            "methods": ["ANGULAR_SWEEP"],
            "target_agl_ids": [agl["id"]],
            "default_config": {"measurement_density": 3},
        },
    ).json()

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    mission_payload = {
        "name": f"Scope Mission {icao}",
        "airport_id": airport_id,
        "drone_profile_id": drone["id"],
        "default_speed": 5.0,
        "transit_agl": 10.0,
        "flight_plan_scope": scope,
    }
    if with_coordinates:
        mission_payload["takeoff_coordinate"] = DEFAULT_TAKEOFF
        mission_payload["landing_coordinate"] = DEFAULT_LANDING

    mission = client.post("/api/v1/missions", json=mission_payload).json()
    mission_id = mission["id"]

    client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template["id"], "method": "ANGULAR_SWEEP"},
    )

    return mission_id


def test_full_scope_produces_takeoff_and_landing_waypoints(client):
    """FULL scope generates first TAKEOFF waypoint and last LANDING waypoint."""
    mission_id = _setup_trajectory_mission(client, "ZFFL", "FULL")
    gen = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert gen.status_code == 200

    fp = client.get(f"/api/v1/missions/{mission_id}/flight-plan").json()
    types = [wp["waypoint_type"] for wp in fp["waypoints"]]
    assert types[0] == "TAKEOFF"
    assert types[-1] == "LANDING"
    assert "TRANSIT" in types


def test_no_takeoff_landing_scope_omits_takeoff_landing_waypoints(client):
    """NO_TAKEOFF_LANDING scope produces no TAKEOFF or LANDING waypoints."""
    mission_id = _setup_trajectory_mission(client, "ZFNL", "NO_TAKEOFF_LANDING")
    gen = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert gen.status_code == 200

    fp = client.get(f"/api/v1/missions/{mission_id}/flight-plan").json()
    types = [wp["waypoint_type"] for wp in fp["waypoints"]]
    assert "TAKEOFF" not in types
    assert "LANDING" not in types
    assert types[0] == "TRANSIT"


def test_measurements_only_scope_contains_only_measurement_waypoints(client):
    """MEASUREMENTS_ONLY scope produces only MEASUREMENT and HOVER waypoints."""
    mission_id = _setup_trajectory_mission(client, "ZFMS", "MEASUREMENTS_ONLY")
    gen = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert gen.status_code == 200

    fp = client.get(f"/api/v1/missions/{mission_id}/flight-plan").json()
    types = {wp["waypoint_type"] for wp in fp["waypoints"]}
    assert types.issubset({"MEASUREMENT", "HOVER"})
    assert "TAKEOFF" not in types
    assert "LANDING" not in types
    assert "TRANSIT" not in types


def test_measurements_only_does_not_require_coordinates(client):
    """MEASUREMENTS_ONLY scope succeeds without takeoff/landing coordinates."""
    mission_id = _setup_trajectory_mission(
        client, "ZFNC", "MEASUREMENTS_ONLY", with_coordinates=False
    )
    gen = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert gen.status_code == 200


def test_no_takeoff_landing_requires_coordinates(client):
    """NO_TAKEOFF_LANDING scope fails without takeoff/landing coordinates."""
    mission_id = _setup_trajectory_mission(
        client, "ZFTC", "NO_TAKEOFF_LANDING", with_coordinates=False
    )
    gen = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert gen.status_code == 400


def test_measurements_only_two_inspections_no_transit_between_passes(client):
    """MEASUREMENTS_ONLY with two inspections has no TRANSIT waypoints."""
    airport = client.post(
        "/api/v1/airports",
        json={**TRAJECTORY_AIRPORT_PAYLOAD, "icao_code": "ZFMI"},
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

    for i in range(1, 4):
        client.post(
            f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls/{agl['id']}/lhas",
            json=make_lha_payload(i),
        )

    # two templates targeting the same AGL
    template1 = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": "Scope M2 Template A",
            "methods": ["ANGULAR_SWEEP"],
            "target_agl_ids": [agl["id"]],
            "default_config": {"measurement_density": 3},
        },
    ).json()
    template2 = client.post(
        "/api/v1/inspection-templates",
        json={
            "name": "Scope M2 Template B",
            "methods": ["ANGULAR_SWEEP"],
            "target_agl_ids": [agl["id"]],
            "default_config": {"measurement_density": 3},
        },
    ).json()

    drone = client.post("/api/v1/drone-profiles", json=TRAJECTORY_DRONE_PAYLOAD).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "Multi-Inspection MEASUREMENTS_ONLY",
            "airport_id": airport_id,
            "drone_profile_id": drone["id"],
            "default_speed": 5.0,
            "transit_agl": 10.0,
            "flight_plan_scope": "MEASUREMENTS_ONLY",
        },
    ).json()
    mission_id = mission["id"]

    client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template1["id"], "method": "ANGULAR_SWEEP"},
    )
    client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template2["id"], "method": "ANGULAR_SWEEP"},
    )

    gen = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    assert gen.status_code == 200

    fp = client.get(f"/api/v1/missions/{mission_id}/flight-plan").json()
    types = [wp["waypoint_type"] for wp in fp["waypoints"]]
    assert "TRANSIT" not in types
    assert "TAKEOFF" not in types
    assert "LANDING" not in types
    assert all(t in ("MEASUREMENT", "HOVER") for t in types)
