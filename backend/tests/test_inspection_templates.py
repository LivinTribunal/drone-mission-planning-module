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


def test_create_template(client):
    payload = {
        "name": "PAPI Angular Sweep",
        "description": "angular sweep for PAPI",
        "methods": ["ANGULAR_SWEEP"],
        "default_config": {
            "altitude_offset": 0.0,
            "speed_override": 5.0,
            "measurement_density": 10,
        },
    }
    r = client.post("/api/v1/inspection-templates", json=payload)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "PAPI Angular Sweep"
    assert data["methods"] == ["ANGULAR_SWEEP"]
    assert data["default_config"]["speed_override"] == 5.0


def test_list_templates(client):
    r = client.get("/api/v1/inspection-templates")
    assert r.status_code == 200
    body = r.json()
    assert body["meta"]["total"] >= 1


def test_get_template(client):
    templates = client.get("/api/v1/inspection-templates").json()["data"]
    template_id = templates[0]["id"]

    r = client.get(f"/api/v1/inspection-templates/{template_id}")
    assert r.status_code == 200
    assert r.json()["name"] == "PAPI Angular Sweep"


def test_update_template(client):
    templates = client.get("/api/v1/inspection-templates").json()["data"]
    template_id = templates[0]["id"]

    r = client.put(
        f"/api/v1/inspection-templates/{template_id}",
        json={"name": "Updated Sweep", "methods": ["ANGULAR_SWEEP", "VERTICAL_PROFILE"]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Updated Sweep"
    assert len(data["methods"]) == 2


def test_delete_template(client):
    # create throwaway
    payload = {"name": "Temp Template", "methods": []}
    r = client.post("/api/v1/inspection-templates", json=payload)
    template_id = r.json()["id"]

    r = client.delete(f"/api/v1/inspection-templates/{template_id}")
    assert r.status_code == 204
