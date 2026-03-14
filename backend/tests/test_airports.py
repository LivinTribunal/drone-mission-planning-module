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
    # TODO: use testcontainers-postgres
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
AIRPORT_PAYLOAD = {
    "icao_code": "LKPR",
    "name": "Prague Airport",
    "elevation": 380.0,
    "location": {"type": "Point", "coordinates": [14.26, 50.10, 380.0]},
}


# Tests
def test_create_airport(client):
    r = client.post("/api/v1/airports", json=AIRPORT_PAYLOAD)
    assert r.status_code == 201
    data = r.json()
    assert data["icao_code"] == "LKPR"
    assert data["name"] == "Prague Airport"
    assert "id" in data


def test_list_airports(client):
    r = client.get("/api/v1/airports")
    assert r.status_code == 200
    body = r.json()
    assert body["meta"]["total"] >= 1
    assert any(a["icao_code"] == "LKPR" for a in body["data"])


def test_get_airport_detail(client):
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    r = client.get(f"/api/v1/airports/{airport_id}")
    assert r.status_code == 200
    data = r.json()
    assert "surfaces" in data
    assert "obstacles" in data
    assert "safety_zones" in data


def test_update_airport(client):
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    r = client.put(f"/api/v1/airports/{airport_id}", json={"name": "Vaclav Havel"})
    assert r.status_code == 200
    assert r.json()["name"] == "Vaclav Havel"


def test_create_surface(client):
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    surface = {
        "identifier": "06/24",
        "surface_type": "RUNWAY",
        "geometry": {
            "type": "LineString",
            "coordinates": [[14.24, 50.10, 380], [14.27, 50.09, 380]],
        },
        "heading": 243.0,
        "length": 3715.0,
        "width": 45.0,
    }
    r = client.post(f"/api/v1/airports/{airport_id}/surfaces", json=surface)
    assert r.status_code == 201
    assert r.json()["identifier"] == "06/24"


def test_create_obstacle(client):
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    obstacle = {
        "name": "Tower",
        "position": {"type": "Point", "coordinates": [14.262, 50.101, 380]},
        "height": 40.0,
        "radius": 15.0,
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [14.261, 50.100, 380],
                    [14.263, 50.100, 380],
                    [14.263, 50.102, 380],
                    [14.261, 50.102, 380],
                    [14.261, 50.100, 380],
                ]
            ],
        },
        "type": "TOWER",
    }
    r = client.post(f"/api/v1/airports/{airport_id}/obstacles", json=obstacle)
    assert r.status_code == 201
    assert r.json()["name"] == "Tower"


def test_create_safety_zone(client):
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    zone = {
        "name": "Prague CTR",
        "type": "CTR",
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [14.18, 50.05, 0],
                    [14.34, 50.05, 0],
                    [14.34, 50.15, 0],
                    [14.18, 50.15, 0],
                    [14.18, 50.05, 0],
                ]
            ],
        },
        "altitude_floor": 0.0,
        "altitude_ceiling": 2500.0,
    }
    r = client.post(f"/api/v1/airports/{airport_id}/safety-zones", json=zone)
    assert r.status_code == 201
    assert r.json()["name"] == "Prague CTR"


def test_create_agl_and_lha(client):
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    surfaces = client.get(f"/api/v1/airports/{airport_id}/surfaces").json()["data"]
    surface_id = surfaces[0]["id"]

    agl = {
        "agl_type": "PAPI",
        "name": "PAPI RWY 24",
        "position": {"type": "Point", "coordinates": [14.274, 50.097, 380]},
        "side": "LEFT",
        "glide_slope_angle": 3.0,
    }
    r = client.post(f"/api/v1/airports/surfaces/{surface_id}/agls", json=agl)
    assert r.status_code == 201
    agl_id = r.json()["id"]

    lha = {
        "unit_number": 1,
        "setting_angle": 3.0,
        "lamp_type": "HALOGEN",
        "position": {"type": "Point", "coordinates": [14.2743, 50.0978, 380]},
    }
    r = client.post(f"/api/v1/airports/agls/{agl_id}/lhas", json=lha)
    assert r.status_code == 201
    assert r.json()["unit_number"] == 1


def test_delete_airport(client):
    # create a throwaway airport to delete
    payload = {
        "icao_code": "LKTB",
        "name": "Brno Airport",
        "elevation": 241.0,
        "location": {"type": "Point", "coordinates": [16.69, 49.15, 241.0]},
    }
    r = client.post("/api/v1/airports", json=payload)
    assert r.status_code == 201
    airport_id = r.json()["id"]

    r = client.delete(f"/api/v1/airports/{airport_id}")
    assert r.status_code == 204

    r = client.get(f"/api/v1/airports/{airport_id}")
    assert r.status_code == 404
