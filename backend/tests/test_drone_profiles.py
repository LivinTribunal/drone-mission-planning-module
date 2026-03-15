from tests.data.drones import DRONE_PAYLOAD


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
