from uuid import uuid4

import pytest

from app.core.exceptions import DomainError, NotFoundError
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


# batch_update_waypoints service tests


def _create_mission_with_waypoints(db_session, airport_id, status="DRAFT", waypoint_types=None):
    """helper to create a mission with a flight plan and waypoints."""
    from app.models.flight_plan import FlightPlan, ValidationResult, Waypoint
    from app.models.mission import Mission
    from app.services.geometry_converter import geojson_to_ewkt

    mission = Mission(
        id=uuid4(),
        name="batch test mission",
        airport_id=airport_id,
        status=status,
        takeoff_coordinate=geojson_to_ewkt({"type": "Point", "coordinates": [18.11, 49.69, 260.0]}),
        landing_coordinate=geojson_to_ewkt({"type": "Point", "coordinates": [18.12, 49.69, 260.0]}),
    )
    db_session.add(mission)
    db_session.flush()

    fp = FlightPlan(id=uuid4(), mission_id=mission.id, airport_id=airport_id)
    fp.compile(100.0, 60.0)
    db_session.add(fp)
    db_session.flush()

    val_result = ValidationResult(id=uuid4(), flight_plan_id=fp.id, passed=True)
    db_session.add(val_result)
    db_session.flush()

    if waypoint_types is None:
        waypoint_types = ["TAKEOFF", "TRANSIT", "MEASUREMENT", "TRANSIT", "LANDING"]

    waypoints = []
    for i, wtype in enumerate(waypoint_types, start=1):
        wp = Waypoint(
            id=uuid4(),
            flight_plan_id=fp.id,
            sequence_order=i,
            position=geojson_to_ewkt(
                {"type": "Point", "coordinates": [18.11 + i * 0.001, 49.69, 260.0 + i]}
            ),
            waypoint_type=wtype,
        )
        db_session.add(wp)
        waypoints.append(wp)

    db_session.flush()
    return mission, fp, waypoints


def test_batch_update_moves_waypoint(db_session, fp_airport_id):
    """batch_update_waypoints updates waypoint position."""
    from sqlalchemy import func

    from app.models.flight_plan import Waypoint
    from app.schemas.flight_plan import WaypointPositionUpdate
    from app.schemas.geometry import PointZ
    from app.services.flight_plan_service import batch_update_waypoints

    mission, fp, waypoints = _create_mission_with_waypoints(db_session, fp_airport_id)
    transit_wp = waypoints[1]

    new_pos = PointZ(type="Point", coordinates=[18.115, 49.695, 270.0])
    updates = [WaypointPositionUpdate(waypoint_id=transit_wp.id, position=new_pos)]

    batch_update_waypoints(db_session, mission.id, updates)

    wkt = (
        db_session.query(func.ST_AsText(Waypoint.position))
        .filter(Waypoint.id == transit_wp.id)
        .scalar()
    )
    assert "18.115" in wkt
    assert "49.695" in wkt

    db_session.rollback()


def test_batch_update_waypoint_ownership(db_session, fp_airport_id):
    """batch_update_waypoints rejects waypoints from another flight plan."""
    from app.schemas.flight_plan import WaypointPositionUpdate
    from app.schemas.geometry import PointZ
    from app.services.flight_plan_service import batch_update_waypoints

    mission1, fp1, wps1 = _create_mission_with_waypoints(db_session, fp_airport_id)
    mission2, fp2, wps2 = _create_mission_with_waypoints(db_session, fp_airport_id)

    # try to update mission1 using a waypoint from mission2
    updates = [
        WaypointPositionUpdate(
            waypoint_id=wps2[0].id,
            position=PointZ(type="Point", coordinates=[18.0, 49.0, 260.0]),
        )
    ]

    with pytest.raises(NotFoundError, match="waypoint.*not found"):
        batch_update_waypoints(db_session, mission1.id, updates)

    db_session.rollback()


def test_batch_update_status_gate(db_session, fp_airport_id):
    """batch_update_waypoints rejects updates when mission is in EXPORTED status."""
    from app.schemas.flight_plan import WaypointPositionUpdate
    from app.schemas.geometry import PointZ
    from app.services.flight_plan_service import batch_update_waypoints

    mission, fp, wps = _create_mission_with_waypoints(db_session, fp_airport_id, status="EXPORTED")

    updates = [
        WaypointPositionUpdate(
            waypoint_id=wps[1].id,
            position=PointZ(type="Point", coordinates=[18.0, 49.0, 260.0]),
        )
    ]

    with pytest.raises(DomainError, match="cannot modify waypoints"):
        batch_update_waypoints(db_session, mission.id, updates)

    db_session.rollback()


def test_batch_update_takeoff_syncs_mission_coordinate(db_session, fp_airport_id):
    """moving a takeoff waypoint updates mission.takeoff_coordinate."""
    from sqlalchemy import func

    from app.models.mission import Mission
    from app.schemas.flight_plan import WaypointPositionUpdate
    from app.schemas.geometry import PointZ
    from app.services.flight_plan_service import batch_update_waypoints

    mission, fp, wps = _create_mission_with_waypoints(db_session, fp_airport_id)
    takeoff_wp = wps[0]

    new_pos = PointZ(type="Point", coordinates=[18.15, 49.70, 265.0])
    updates = [WaypointPositionUpdate(waypoint_id=takeoff_wp.id, position=new_pos)]
    batch_update_waypoints(db_session, mission.id, updates)

    wkt = (
        db_session.query(func.ST_AsText(Mission.takeoff_coordinate))
        .filter(Mission.id == mission.id)
        .scalar()
    )
    assert "18.15" in wkt
    assert "49.7" in wkt

    db_session.rollback()


def test_batch_update_landing_syncs_mission_coordinate(db_session, fp_airport_id):
    """moving a landing waypoint updates mission.landing_coordinate."""
    from sqlalchemy import func

    from app.models.mission import Mission
    from app.schemas.flight_plan import WaypointPositionUpdate
    from app.schemas.geometry import PointZ
    from app.services.flight_plan_service import batch_update_waypoints

    mission, fp, wps = _create_mission_with_waypoints(db_session, fp_airport_id)
    landing_wp = wps[4]

    new_pos = PointZ(type="Point", coordinates=[18.13, 49.71, 262.0])
    updates = [WaypointPositionUpdate(waypoint_id=landing_wp.id, position=new_pos)]
    batch_update_waypoints(db_session, mission.id, updates)

    wkt = (
        db_session.query(func.ST_AsText(Mission.landing_coordinate))
        .filter(Mission.id == mission.id)
        .scalar()
    )
    assert "18.13" in wkt
    assert "49.71" in wkt

    db_session.rollback()


def test_batch_update_regresses_validated_to_planned(db_session, fp_airport_id):
    """batch_update_waypoints regresses VALIDATED mission to PLANNED."""
    from app.schemas.flight_plan import WaypointPositionUpdate
    from app.schemas.geometry import PointZ
    from app.services.flight_plan_service import batch_update_waypoints

    mission, fp, wps = _create_mission_with_waypoints(db_session, fp_airport_id, status="VALIDATED")

    updates = [
        WaypointPositionUpdate(
            waypoint_id=wps[1].id,
            position=PointZ(type="Point", coordinates=[18.0, 49.0, 260.0]),
        )
    ]
    batch_update_waypoints(db_session, mission.id, updates)

    assert str(mission.status) == "PLANNED"

    db_session.rollback()


def test_batch_update_too_large(db_session, fp_airport_id):
    """batch_update_waypoints rejects batches over 200 entries."""
    from app.schemas.flight_plan import WaypointPositionUpdate
    from app.schemas.geometry import PointZ
    from app.services.flight_plan_service import batch_update_waypoints

    mission, fp, wps = _create_mission_with_waypoints(db_session, fp_airport_id)

    updates = [
        WaypointPositionUpdate(
            waypoint_id=wps[0].id,
            position=PointZ(type="Point", coordinates=[18.0, 49.0, 260.0]),
        )
    ] * 201

    with pytest.raises(DomainError, match="batch too large"):
        batch_update_waypoints(db_session, mission.id, updates)

    db_session.rollback()


# insert_transit_waypoint service tests


def test_insert_transit_waypoint_sequence(db_session, fp_airport_id):
    """insert_transit_waypoint inserts at correct position and resequences."""
    from app.models.flight_plan import Waypoint
    from app.schemas.flight_plan import TransitWaypointInsertRequest
    from app.schemas.geometry import PointZ
    from app.services.flight_plan_service import insert_transit_waypoint

    mission, fp, wps = _create_mission_with_waypoints(db_session, fp_airport_id)

    request = TransitWaypointInsertRequest(
        position=PointZ(type="Point", coordinates=[18.116, 49.692, 268.0]),
        after_sequence=2,
    )
    insert_transit_waypoint(db_session, mission.id, request)

    ordered = (
        db_session.query(Waypoint)
        .filter(Waypoint.flight_plan_id == fp.id)
        .order_by(Waypoint.sequence_order)
        .all()
    )

    assert len(ordered) == 6
    assert ordered[2].sequence_order == 3
    assert ordered[2].waypoint_type == "TRANSIT"
    # original waypoints after insertion point shifted by 1
    assert ordered[3].sequence_order == 4

    db_session.rollback()


def test_insert_transit_status_gate(db_session, fp_airport_id):
    """insert_transit_waypoint rejects when mission is COMPLETED."""
    from app.schemas.flight_plan import TransitWaypointInsertRequest
    from app.schemas.geometry import PointZ
    from app.services.flight_plan_service import insert_transit_waypoint

    mission, fp, wps = _create_mission_with_waypoints(db_session, fp_airport_id, status="COMPLETED")

    request = TransitWaypointInsertRequest(
        position=PointZ(type="Point", coordinates=[18.0, 49.0, 260.0]),
        after_sequence=1,
    )

    with pytest.raises(DomainError, match="cannot modify waypoints"):
        insert_transit_waypoint(db_session, mission.id, request)

    db_session.rollback()


def test_insert_transit_regresses_validated(db_session, fp_airport_id):
    """insert_transit_waypoint regresses VALIDATED to PLANNED."""
    from app.schemas.flight_plan import TransitWaypointInsertRequest
    from app.schemas.geometry import PointZ
    from app.services.flight_plan_service import insert_transit_waypoint

    mission, fp, wps = _create_mission_with_waypoints(db_session, fp_airport_id, status="VALIDATED")

    request = TransitWaypointInsertRequest(
        position=PointZ(type="Point", coordinates=[18.0, 49.0, 260.0]),
        after_sequence=1,
    )
    insert_transit_waypoint(db_session, mission.id, request)

    assert str(mission.status) == "PLANNED"

    db_session.rollback()


def test_insert_transit_no_flight_plan(db_session, fp_airport_id):
    """insert_transit_waypoint returns 404 when no flight plan exists."""
    from app.models.mission import Mission
    from app.schemas.flight_plan import TransitWaypointInsertRequest
    from app.schemas.geometry import PointZ
    from app.services.flight_plan_service import insert_transit_waypoint

    mission = Mission(id=uuid4(), name="no fp mission", airport_id=fp_airport_id, status="DRAFT")
    db_session.add(mission)
    db_session.flush()

    request = TransitWaypointInsertRequest(
        position=PointZ(type="Point", coordinates=[18.0, 49.0, 260.0]),
        after_sequence=1,
    )

    with pytest.raises(NotFoundError, match="flight plan not found"):
        insert_transit_waypoint(db_session, mission.id, request)

    db_session.rollback()


# delete_transit_waypoint service tests


def test_delete_transit_waypoint_resequences(db_session, fp_airport_id):
    """delete_transit_waypoint removes waypoint and resequences."""
    from app.models.flight_plan import Waypoint
    from app.services.flight_plan_service import delete_transit_waypoint

    mission, fp, wps = _create_mission_with_waypoints(db_session, fp_airport_id)
    transit_wp = wps[1]  # TRANSIT at sequence 2

    delete_transit_waypoint(db_session, mission.id, transit_wp.id)

    ordered = (
        db_session.query(Waypoint)
        .filter(Waypoint.flight_plan_id == fp.id)
        .order_by(Waypoint.sequence_order)
        .all()
    )

    assert len(ordered) == 4
    sequences = [w.sequence_order for w in ordered]
    assert sequences == [1, 2, 3, 4]

    db_session.rollback()


def test_delete_non_transit_waypoint_rejected(db_session, fp_airport_id):
    """delete_transit_waypoint rejects non-transit waypoints."""
    from app.services.flight_plan_service import delete_transit_waypoint

    mission, fp, wps = _create_mission_with_waypoints(db_session, fp_airport_id)
    takeoff_wp = wps[0]  # TAKEOFF

    with pytest.raises(DomainError, match="only transit waypoints"):
        delete_transit_waypoint(db_session, mission.id, takeoff_wp.id)

    db_session.rollback()
