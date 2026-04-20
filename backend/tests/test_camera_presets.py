"""tests for camera preset CRUD api."""

from types import SimpleNamespace
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.main import app
from app.models.user import User

OPERATOR_USER_ID = UUID("00000000-0000-0000-0000-000000000088")

PRESET_PAYLOAD = {
    "name": "PAPI Night - DJI M30T",
    "is_default": False,
    "white_balance": "TUNGSTEN",
    "iso": 800,
    "shutter_speed": "1/500",
    "focus_mode": "MANUAL",
    "focus_distance_m": 300.0,
    "optical_zoom": 5.0,
}


def test_create_preset(client):
    """test creating a camera preset."""
    r = client.post("/api/v1/camera-presets", json=PRESET_PAYLOAD)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "PAPI Night - DJI M30T"
    assert data["white_balance"] == "TUNGSTEN"
    assert data["iso"] == 800
    assert data["focus_mode"] == "MANUAL"
    assert data["is_default"] is False
    assert data["created_by"] is not None


def test_list_presets(client):
    """test listing camera presets."""
    r = client.get("/api/v1/camera-presets")
    assert r.status_code == 200
    body = r.json()
    assert body["meta"]["total"] >= 1
    assert any(p["name"] == "PAPI Night - DJI M30T" for p in body["data"])


def test_list_presets_filter_is_default(client):
    """test filtering presets by is_default."""
    # create a default preset
    client.post(
        "/api/v1/camera-presets",
        json={**PRESET_PAYLOAD, "name": "Default Preset", "is_default": True},
    )

    r = client.get("/api/v1/camera-presets", params={"is_default": True})
    assert r.status_code == 200
    data = r.json()["data"]
    assert all(p["is_default"] is True for p in data)


def test_get_preset(client):
    """test getting a single preset."""
    presets = client.get("/api/v1/camera-presets").json()["data"]
    preset_id = presets[0]["id"]

    r = client.get(f"/api/v1/camera-presets/{preset_id}")
    assert r.status_code == 200
    assert r.json()["id"] == preset_id


def test_update_preset(client):
    """test updating a camera preset."""
    presets = client.get("/api/v1/camera-presets").json()["data"]
    preset_id = presets[0]["id"]

    r = client.put(
        f"/api/v1/camera-presets/{preset_id}",
        json={"iso": 1600, "shutter_speed": "1/1000"},
    )
    assert r.status_code == 200
    assert r.json()["iso"] == 1600
    assert r.json()["shutter_speed"] == "1/1000"


def test_delete_preset(client):
    """test deleting a camera preset."""
    r = client.post(
        "/api/v1/camera-presets",
        json={"name": "Throwaway Preset", "white_balance": "DAYLIGHT"},
    )
    preset_id = r.json()["id"]

    r = client.delete(f"/api/v1/camera-presets/{preset_id}")
    assert r.status_code == 200
    assert r.json()["deleted"] is True

    # verify it's gone
    r = client.get(f"/api/v1/camera-presets/{preset_id}")
    assert r.status_code == 404


def test_create_preset_with_drone_profile(client):
    """test creating a preset tied to a drone profile."""
    # create a drone profile first
    drone = client.post("/api/v1/drone-profiles", json={"name": "Preset Test Drone"}).json()

    r = client.post(
        "/api/v1/camera-presets",
        json={**PRESET_PAYLOAD, "name": "Drone Specific", "drone_profile_id": drone["id"]},
    )
    assert r.status_code == 201
    assert r.json()["drone_profile_id"] == drone["id"]

    # filter by drone_profile_id should return it
    r = client.get("/api/v1/camera-presets", params={"drone_profile_id": drone["id"]})
    assert r.status_code == 200
    names = [p["name"] for p in r.json()["data"]]
    assert "Drone Specific" in names

    # cleanup
    client.delete(f"/api/v1/drone-profiles/{drone['id']}")


def test_create_default_preset(client):
    """test creating a default preset (test user is super_admin)."""
    r = client.post(
        "/api/v1/camera-presets",
        json={
            "name": "Global Default",
            "is_default": True,
            "white_balance": "CLOUDY",
        },
    )
    assert r.status_code == 201
    assert r.json()["is_default"] is True


def test_get_nonexistent_preset(client):
    """test getting a preset that does not exist."""
    r = client.get("/api/v1/camera-presets/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


def test_get_preset_access_control(client, db_engine):
    """test that a non-owner operator cannot fetch another user's private preset."""
    # create a private preset as the default super_admin test user
    r = client.post(
        "/api/v1/camera-presets",
        json={"name": "Private Owner Preset", "white_balance": "DAYLIGHT"},
    )
    assert r.status_code == 201
    private_preset_id = r.json()["id"]

    # also create a default preset to verify those remain accessible
    r = client.post(
        "/api/v1/camera-presets",
        json={"name": "Public Default Preset", "is_default": True, "white_balance": "CLOUDY"},
    )
    assert r.status_code == 201
    default_preset_id = r.json()["id"]

    # create a second user (operator) in the db
    session = sessionmaker(bind=db_engine)()
    try:
        existing = session.query(User).filter(User.id == OPERATOR_USER_ID).first()
        if not existing:
            user_b = User(
                id=OPERATOR_USER_ID,
                email="operator@tarmacview.com",
                name="Operator B",
                role="OPERATOR",
                is_active=True,
            )
            user_b.set_password("testpassword")
            session.add(user_b)
            session.commit()
    finally:
        session.close()

    # build a client that authenticates as the operator user
    operator_stub = SimpleNamespace(
        id=OPERATOR_USER_ID,
        email="operator@tarmacview.com",
        name="Operator B",
        role="OPERATOR",
        is_active=True,
        airports=[],
    )
    operator_stub.has_airport_access = lambda airport_id: True

    TestSession = sessionmaker(bind=db_engine)

    def override_db():
        """test db override."""
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: operator_stub
    operator_client = TestClient(app)

    # operator should NOT be able to fetch another user's private preset
    r = operator_client.get(f"/api/v1/camera-presets/{private_preset_id}")
    assert r.status_code == 404

    # operator CAN fetch a default preset
    r = operator_client.get(f"/api/v1/camera-presets/{default_preset_id}")
    assert r.status_code == 200
    assert r.json()["id"] == default_preset_id
