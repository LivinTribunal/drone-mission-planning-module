from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.models.enums import ComputationStatus
from app.models.mission import Mission
from tests.data.missions import MISSION_AIRPORT_PAYLOAD


@pytest.fixture(scope="module")
def cs_airport_id(client):
    """create a test airport for computation status tests."""
    payload = {**MISSION_AIRPORT_PAYLOAD, "icao_code": "LKCS"}
    r = client.post("/api/v1/airports", json=payload)
    return r.json()["id"]


# model method tests


def test_mark_computing(db_session, cs_airport_id):
    """mark_computing sets status, clears error, sets timestamp."""
    mission = Mission(id=uuid4(), name="test computing", airport_id=cs_airport_id, status="DRAFT")
    db_session.add(mission)
    db_session.flush()

    mission.mark_computing()
    db_session.flush()
    db_session.expire(mission)

    assert mission.computation_status == ComputationStatus.COMPUTING
    assert mission.computation_error is None
    assert isinstance(mission.computation_started_at, datetime)

    db_session.rollback()


def test_mark_computation_completed(db_session, cs_airport_id):
    """mark_computation_completed sets status to COMPLETED and clears fields."""
    mission = Mission(id=uuid4(), name="test completed", airport_id=cs_airport_id, status="DRAFT")
    db_session.add(mission)
    db_session.flush()

    mission.mark_computing()
    db_session.flush()
    mission.mark_computation_completed()
    db_session.flush()

    assert mission.computation_status == ComputationStatus.COMPLETED
    assert mission.computation_error is None
    assert mission.computation_started_at is None

    db_session.rollback()


def test_mark_computation_failed(db_session, cs_airport_id):
    """mark_computation_failed sets status to FAILED with error message."""
    mission = Mission(id=uuid4(), name="test failed", airport_id=cs_airport_id, status="DRAFT")
    db_session.add(mission)
    db_session.flush()

    mission.mark_computing()
    db_session.flush()
    mission.mark_computation_failed("something went wrong")
    db_session.flush()

    assert mission.computation_status == ComputationStatus.FAILED
    assert mission.computation_error == "something went wrong"
    assert mission.computation_started_at is None

    db_session.rollback()


def test_reset_computation_status(db_session, cs_airport_id):
    """reset_computation_status returns to IDLE."""
    mission = Mission(id=uuid4(), name="test reset", airport_id=cs_airport_id, status="DRAFT")
    db_session.add(mission)
    db_session.flush()

    mission.mark_computation_failed("error")
    db_session.flush()
    mission.reset_computation_status()
    db_session.flush()

    assert mission.computation_status == ComputationStatus.IDLE
    assert mission.computation_error is None
    assert mission.computation_started_at is None

    db_session.rollback()


def test_default_computation_status(db_session, cs_airport_id):
    """new mission defaults to IDLE computation status."""
    mission = Mission(id=uuid4(), name="test default", airport_id=cs_airport_id, status="DRAFT")
    db_session.add(mission)
    db_session.flush()

    assert mission.computation_status == "IDLE"
    assert mission.computation_error is None
    assert mission.computation_started_at is None

    db_session.rollback()


# api endpoint tests


def test_computation_status_endpoint_returns_idle(client, cs_airport_id):
    """GET computation-status returns IDLE for a fresh mission."""
    r = client.post(
        "/api/v1/missions",
        json={"name": "Status Test", "airport_id": cs_airport_id},
    )
    mission_id = r.json()["id"]

    r = client.get(f"/api/v1/missions/{mission_id}/computation-status")
    assert r.status_code == 200
    data = r.json()
    assert data["computation_status"] == "IDLE"
    assert data["computation_error"] is None
    assert data["computation_started_at"] is None


def test_computation_status_not_found(client):
    """GET computation-status returns 404 for non-existent mission."""
    fake_id = "00000000-0000-0000-0000-000000000000"
    r = client.get(f"/api/v1/missions/{fake_id}/computation-status")
    assert r.status_code == 404


def test_computation_status_in_mission_response(client, cs_airport_id):
    """mission response includes computation_status fields."""
    r = client.post(
        "/api/v1/missions",
        json={"name": "Response Fields Test", "airport_id": cs_airport_id},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["computation_status"] == "IDLE"
    assert data["computation_error"] is None
    assert data["computation_started_at"] is None


def test_computation_status_staleness_detection(client, db_session, cs_airport_id):
    """computation-status endpoint detects stale COMPUTING status and reports FAILED."""
    r = client.post(
        "/api/v1/missions",
        json={"name": "stale test", "airport_id": cs_airport_id},
    )
    mission_id = r.json()["id"]

    # seed a stale COMPUTING state directly in db
    mission = db_session.query(Mission).filter_by(id=mission_id).one()
    mission.computation_status = "COMPUTING"
    mission.computation_started_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    db_session.commit()

    r = client.get(f"/api/v1/missions/{mission_id}/computation-status")
    assert r.status_code == 200
    data = r.json()
    assert data["computation_status"] == "FAILED"
    assert data["computation_error"] == "computation timed out"


def test_generate_trajectory_sets_computation_status(client, cs_airport_id):
    """generate-trajectory updates computation_status on failure (no inspections)."""
    r = client.post(
        "/api/v1/missions",
        json={
            "name": "Compute Status Test",
            "airport_id": cs_airport_id,
            "takeoff_coordinate": {"type": "Point", "coordinates": [18.11, 49.69, 260.0]},
            "landing_coordinate": {"type": "Point", "coordinates": [18.12, 49.69, 260.0]},
        },
    )
    mission_id = r.json()["id"]

    # try to generate trajectory (will fail - no inspections)
    r = client.post(f"/api/v1/missions/{mission_id}/generate-trajectory")
    # should fail since there are no inspections
    assert r.status_code in (400, 422, 500)

    # check that computation status was set to FAILED
    r = client.get(f"/api/v1/missions/{mission_id}/computation-status")
    assert r.status_code == 200
    data = r.json()
    assert data["computation_status"] == "FAILED"
    assert data["computation_error"] is not None
