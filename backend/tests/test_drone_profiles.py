import io

from tests.data.drones import DRONE_PAYLOAD, DRONE_UPDATE_PAYLOAD, THROWAWAY_DRONE_PAYLOAD


# Tests
def test_create_drone(client):
    """test create drone profile"""
    response = client.post("/api/v1/drone-profiles", json=DRONE_PAYLOAD)
    assert response.status_code == 201
    data = response.json()

    assert data["name"] == "DJI Matrice 300 RTK"
    assert data["max_speed"] == 23.0
    assert data["camera_frame_rate"] == 30
    # new capability flag defaults to false when omitted from the payload
    assert data["supports_geozone_upload"] is False


def test_supports_geozone_upload_round_trip(client):
    """create + update of supports_geozone_upload persists through the api."""
    payload = {
        "name": "Holybro Pixhawk",
        "manufacturer": "Holybro",
        "supports_geozone_upload": True,
    }
    created = client.post("/api/v1/drone-profiles", json=payload).json()
    assert created["supports_geozone_upload"] is True

    drone_id = created["id"]
    updated = client.put(
        f"/api/v1/drone-profiles/{drone_id}",
        json={"supports_geozone_upload": False},
    ).json()
    assert updated["supports_geozone_upload"] is False

    # cleanup
    client.delete(f"/api/v1/drone-profiles/{drone_id}")


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

    response = client.put(f"/api/v1/drone-profiles/{drone_id}", json=DRONE_UPDATE_PAYLOAD)
    assert response.status_code == 200
    assert response.json()["max_speed"] == 25.0


def test_delete_drone(client):
    # create a throwaway drone
    r = client.post("/api/v1/drone-profiles", json=THROWAWAY_DRONE_PAYLOAD)
    drone_id = r.json()["id"]

    r = client.delete(f"/api/v1/drone-profiles/{drone_id}")
    assert r.status_code == 200
    assert r.json()["deleted"] is True


# model upload and serving tests
def test_upload_model(client):
    """test uploading a custom glb model file."""
    drone = client.post("/api/v1/drone-profiles", json={"name": "Upload Test Drone"}).json()
    drone_id = drone["id"]

    glb_content = b"\x00" * 100
    r = client.post(
        f"/api/v1/drone-profiles/{drone_id}/model",
        files={"file": ("test.glb", io.BytesIO(glb_content), "model/gltf-binary")},
    )
    assert r.status_code == 200
    data = r.json()
    assert "model_identifier" in data
    assert data["model_identifier"].endswith(".glb")

    # cleanup
    client.delete(f"/api/v1/drone-profiles/{drone_id}")


def test_upload_model_invalid_extension(client):
    """test that uploading a non-glb/gltf file is rejected."""
    drone = client.post("/api/v1/drone-profiles", json={"name": "Ext Test Drone"}).json()
    drone_id = drone["id"]

    r = client.post(
        f"/api/v1/drone-profiles/{drone_id}/model",
        files={"file": ("test.obj", io.BytesIO(b"\x00"), "application/octet-stream")},
    )
    assert r.status_code == 400

    client.delete(f"/api/v1/drone-profiles/{drone_id}")


def test_get_model_no_model_assigned(client):
    """test that getting model for drone with no model returns 404."""
    drone = client.post("/api/v1/drone-profiles", json={"name": "No Model Drone"}).json()
    drone_id = drone["id"]

    r = client.get(f"/api/v1/drone-profiles/{drone_id}/model")
    assert r.status_code == 404

    client.delete(f"/api/v1/drone-profiles/{drone_id}")


def test_model_identifier_path_traversal_rejected(client):
    """test that path traversal in model_identifier is rejected at schema level."""
    drone = client.post("/api/v1/drone-profiles", json={"name": "Traversal Test"}).json()
    drone_id = drone["id"]

    r = client.put(
        f"/api/v1/drone-profiles/{drone_id}",
        json={"model_identifier": "../../../../etc/passwd"},
    )
    assert r.status_code == 422

    client.delete(f"/api/v1/drone-profiles/{drone_id}")


def test_model_identifier_safe_values_accepted(client):
    """test that safe model identifiers pass validation."""
    drone = client.post("/api/v1/drone-profiles", json={"name": "Safe ID Test"}).json()
    drone_id = drone["id"]

    r = client.put(
        f"/api/v1/drone-profiles/{drone_id}",
        json={"model_identifier": "custom_abc123.glb"},
    )
    assert r.status_code == 200
    assert r.json()["model_identifier"] == "custom_abc123.glb"

    client.delete(f"/api/v1/drone-profiles/{drone_id}")
