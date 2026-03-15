import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from testcontainers.postgres import PostgresContainer

import app.models  # noqa: F401
from app.core.database import Base, get_db
from app.main import app


# TODO: refactor these tests to use a test database instead of a real postgres container
# TODO: why not create a db_engine outside the test files because every test
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


# Test Data
# TODO: add more inspection templates
# TODO: why not move the test data from all test files to files so its easy to add more templates
TEMPLATE_PAYLOAD = {
    "name": "PAPI Angular Sweep",
    "description": "angular sweep for PAPI",
    "methods": ["ANGULAR_SWEEP"],
    "default_config": {
        "altitude_offset": 0.0,
        "speed_override": 5.0,
        "measurement_density": 10,
    },
}


# Tests
def test_create_template(client):
    """test create inspection template"""
    response = client.post("/api/v1/inspection-templates", json=TEMPLATE_PAYLOAD)
    assert response.status_code == 201
    data = response.json()

    assert data["name"] == "PAPI Angular Sweep"
    assert data["methods"] == ["ANGULAR_SWEEP"]
    assert data["default_config"]["speed_override"] == 5.0


def test_list_templates(client):
    """test list inspection templates"""
    response = client.get("/api/v1/inspection-templates")
    assert response.status_code == 200
    body = response.json()

    assert body["meta"]["total"] >= 1


def test_get_template(client):
    """test get inspection template"""
    templates = client.get("/api/v1/inspection-templates").json()["data"]
    template_id = templates[0]["id"]

    response = client.get(f"/api/v1/inspection-templates/{template_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "PAPI Angular Sweep"


def test_update_template(client):
    """test update inspection template"""
    templates = client.get("/api/v1/inspection-templates").json()["data"]
    template_id = templates[0]["id"]

    response = client.put(
        f"/api/v1/inspection-templates/{template_id}",
        json={"name": "Updated Sweep", "methods": ["ANGULAR_SWEEP", "VERTICAL_PROFILE"]},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["name"] == "Updated Sweep"
    assert len(data["methods"]) == 2


def test_delete_template(client):
    """test delete inspection template"""
    # create throwaway
    payload = {"name": "Temp Template", "methods": []}
    response = client.post("/api/v1/inspection-templates", json=payload)
    template_id = response.json()["id"]

    response = client.delete(f"/api/v1/inspection-templates/{template_id}")
    assert response.status_code == 204
