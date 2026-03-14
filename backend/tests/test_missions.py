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


# Tests


def test_create_mission(client):
    """test create mission"""
    response = client.post("/api/v1/missions", json={"name": "Test Mission"})
    assert response.status_code == 201
    data = response.json()

    assert data["name"] == "Test Mission"
    assert data["status"] == "DRAFT"


def test_list_missions(client):
    """test list missions"""
    response = client.get("/api/v1/missions")
    assert response.status_code == 200
    body = response.json()

    assert body["meta"]["total"] >= 1


def test_list_missions_with_status_filter(client):
    """test list missions filtered by status"""
    response = client.get("/api/v1/missions?status=DRAFT")
    assert response.status_code == 200
    body = response.json()

    assert all(m["status"] == "DRAFT" for m in body["data"])


def test_get_mission_detail(client):
    """test get mission with inspections"""
    missions = client.get("/api/v1/missions").json()["data"]
    mission_id = missions[0]["id"]

    response = client.get(f"/api/v1/missions/{mission_id}")
    assert response.status_code == 200
    data = response.json()

    assert "inspections" in data


def test_update_mission(client):
    """test update mission"""
    missions = client.get("/api/v1/missions").json()["data"]
    mission_id = missions[0]["id"]

    response = client.put(
        f"/api/v1/missions/{mission_id}",
        json={"name": "Updated Mission", "operator_notes": "test notes"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Mission"


def test_duplicate_mission(client):
    """test duplicate mission"""
    missions = client.get("/api/v1/missions").json()["data"]
    mission_id = missions[0]["id"]

    response = client.post(f"/api/v1/missions/{mission_id}/duplicate")
    assert response.status_code == 201
    data = response.json()

    assert data["status"] == "DRAFT"
    assert "(copy)" in data["name"]


def test_delete_mission(client):
    """test delete mission"""
    response = client.post("/api/v1/missions", json={"name": "To Delete"})
    mission_id = response.json()["id"]

    response = client.delete(f"/api/v1/missions/{mission_id}")
    assert response.status_code == 204

    response = client.get(f"/api/v1/missions/{mission_id}")
    assert response.status_code == 404


def test_add_inspection(client):
    """test add inspection to mission"""
    # create a template first
    template = client.post(
        "/api/v1/inspection-templates",
        json={"name": "Test Template", "methods": ["ANGULAR_SWEEP"]},
    ).json()

    missions = client.get("/api/v1/missions").json()["data"]
    mission_id = missions[0]["id"]

    response = client.post(
        f"/api/v1/missions/{mission_id}/inspections",
        json={"template_id": template["id"], "method": "ANGULAR_SWEEP"},
    )
    assert response.status_code == 201
    assert response.json()["method"] == "ANGULAR_SWEEP"


def test_delete_inspection(client):
    """test delete inspection from mission"""
    missions = client.get("/api/v1/missions").json()["data"]
    mission_id = missions[0]["id"]

    detail = client.get(f"/api/v1/missions/{mission_id}").json()
    if detail["inspections"]:
        insp_id = detail["inspections"][0]["id"]

        response = client.delete(f"/api/v1/missions/{mission_id}/inspections/{insp_id}")
        assert response.status_code == 204
