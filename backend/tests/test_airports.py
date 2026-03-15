from tests.data.airports import (
    AGL_PAYLOAD,
    AIRPORT_PAYLOAD,
    LHA_PAYLOAD,
    OBSTACLE_PAYLOAD,
    SAFETY_ZONE_PAYLOAD,
    SURFACE_PAYLOAD,
)


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

    r = client.post(f"/api/v1/airports/{airport_id}/surfaces", json=SURFACE_PAYLOAD)
    assert r.status_code == 201
    assert r.json()["identifier"] == "06/24"


def test_create_obstacle(client):
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    r = client.post(f"/api/v1/airports/{airport_id}/obstacles", json=OBSTACLE_PAYLOAD)
    assert r.status_code == 201
    assert r.json()["name"] == "Tower"


def test_create_safety_zone(client):
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    r = client.post(f"/api/v1/airports/{airport_id}/safety-zones", json=SAFETY_ZONE_PAYLOAD)
    assert r.status_code == 201
    assert r.json()["name"] == "Prague CTR"


def test_create_agl_and_lha(client):
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    surfaces = client.get(f"/api/v1/airports/{airport_id}/surfaces").json()["data"]
    surface_id = surfaces[0]["id"]

    r = client.post(f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls", json=AGL_PAYLOAD)
    assert r.status_code == 201
    agl_id = r.json()["id"]

    r = client.post(
        f"/api/v1/airports/{airport_id}/surfaces/{surface_id}/agls/{agl_id}/lhas",
        json=LHA_PAYLOAD,
    )
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
