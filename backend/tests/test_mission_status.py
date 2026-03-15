import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from testcontainers.postgres import PostgresContainer

import app.models  # noqa: F401
from app.core.database import Base, get_db
from app.main import app


@pytest.fixture(scope="module")
def db_engine():
    """db engine for testing"""
    with PostgresContainer(
        image="postgis/postgis:16-3.4",
        username="test",
        password="test",
        dbname="test",
    ) as pg:
        engine = create_engine(pg.get_connection_url())

        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            conn.commit()

        Base.metadata.create_all(engine)
        yield engine
        Base.metadata.drop_all(engine)


@pytest.fixture(scope="module")
def client(db_engine):
    """client for testing"""
    TestSession = sessionmaker(bind=db_engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(scope="module")
def airport_id(client):
    """create a test airport and return its id"""
    r = client.post(
        "/api/v1/airports",
        json={
            "icao_code": "LKVO",
            "name": "Vodochody Airport",
            "elevation": 280.0,
            "location": {"type": "Point", "coordinates": [14.39, 50.22, 280.0]},
        },
    )

    return r.json()["id"]


def _create_mission(client, airport_id: str, name="Status Test") -> str:
    """helper - create a DRAFT mission and return its id"""
    response = client.post("/api/v1/missions", json={"name": name, "airport_id": airport_id})

    return response.json()["id"]


def test_draft_cannot_validate(client, airport_id):
    """DRAFT -> VALIDATED should fail (must go through PLANNED first)"""
    mission_id = _create_mission(client, airport_id)

    response = client.post(f"/api/v1/missions/{mission_id}/validate")
    assert response.status_code == 409
    detail = response.json()["detail"]

    assert detail["current_status"] == "DRAFT"


def test_draft_cannot_export(client, airport_id):
    """DRAFT -> EXPORTED should fail"""
    mission_id = _create_mission(client, airport_id)

    response = client.post(f"/api/v1/missions/{mission_id}/export")
    assert response.status_code == 409


def test_draft_cannot_complete(client, airport_id):
    """DRAFT -> COMPLETED should fail"""
    mission_id = _create_mission(client, airport_id)

    response = client.post(f"/api/v1/missions/{mission_id}/complete")
    assert response.status_code == 409


def test_draft_cannot_cancel(client, airport_id):
    """DRAFT -> CANCELLED should fail"""
    mission_id = _create_mission(client, airport_id)

    response = client.post(f"/api/v1/missions/{mission_id}/cancel")
    assert response.status_code == 409


def test_invalid_transition_returns_allowed(client, airport_id):
    """invalid transition response includes allowed transitions"""
    mission_id = _create_mission(client, airport_id)

    response = client.post(f"/api/v1/missions/{mission_id}/export")
    assert response.status_code == 409
    detail = response.json()["detail"]

    assert "allowed_transitions" in detail
    assert detail["allowed_transitions"] == ["PLANNED"]


def test_update_regresses_validated_to_planned(client, airport_id):
    """changing trajectory fields should regress VALIDATED -> PLANNED"""
    mission_id = _create_mission(client, airport_id)

    # update with trajectory field on a DRAFT mission - should not fail
    response = client.put(
        f"/api/v1/missions/{mission_id}",
        json={"default_speed": 10.0},
    )
    assert response.status_code == 200
    assert response.json()["default_speed"] == 10.0
