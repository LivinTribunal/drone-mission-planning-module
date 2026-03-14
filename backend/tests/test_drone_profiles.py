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


# Test Data
# TODO: add more drone profiles
DRONE_PAYLOAD = {
    "name": "DJI Matrice 300 RTK",
    "manufacturer": "DJI",
    "model": "Matrice 300 RTK",
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


# Tests
def test_create_drone(client):
    """test create drone profile"""
    response = client.post("/api/v1/drone-profiles", json=DRONE_PAYLOAD)
    assert response.status_code == 201
    data = response.json()

    assert data["name"] == "DJI Matrice 300 RTK"
    assert data["max_speed"] == 23.0
    assert data["camera_frame_rate"] == 30


def test_list_drones(client):
    """test list drone profiles"""
    response = client.get("/api/v1/drone-profiles")
    assert response.status_code == 200
    body = response.json()

    assert body["meta"]["total"] >= 1


def test_get_drone(client):
    """test get drone profile"""
    drones = client.get("/api/v1/drone-profiles").json()["data"]
    drone_id = drones[0]["id"]

    response = client.get(f"/api/v1/drone-profiles/{drone_id}")
    assert response.status_code == 200
    assert response.json()["manufacturer"] == "DJI"


def test_update_drone(client):
    """test update drone profile"""
    drones = client.get("/api/v1/drone-profiles").json()["data"]
    drone_id = drones[0]["id"]

    response = client.put(f"/api/v1/drone-profiles/{drone_id}", json={"max_speed": 25.0})
    assert response.status_code == 200
    assert response.json()["max_speed"] == 25.0


def test_delete_drone(client):
    # create a throwaway drone
    r = client.post("/api/v1/drone-profiles", json={"name": "Test Drone"})
    drone_id = r.json()["id"]

    r = client.delete(f"/api/v1/drone-profiles/{drone_id}")
    assert r.status_code == 200
    assert r.json()["deleted"] is True
