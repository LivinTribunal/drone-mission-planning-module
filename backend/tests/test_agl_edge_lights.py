from tests.data.airports import AGL_PAYLOAD, AIRPORT_PAYLOAD, SURFACE_PAYLOAD


def test_create_runway_edge_lights_agl(client):
    """RUNWAY_EDGE_LIGHTS is a valid agl_type."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LZEL"},
    ).json()
    surface = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=SURFACE_PAYLOAD).json()

    payload = {
        **AGL_PAYLOAD,
        "agl_type": "RUNWAY_EDGE_LIGHTS",
        "name": "RWY 24 Left Edge",
    }
    r = client.post(f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls", json=payload)
    assert r.status_code == 201
    data = r.json()
    assert data["agl_type"] == "RUNWAY_EDGE_LIGHTS"


def test_invalid_agl_type_rejected(client):
    """unknown agl_type values fail with 422."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LZEX"},
    ).json()
    surface = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=SURFACE_PAYLOAD).json()

    payload = {**AGL_PAYLOAD, "agl_type": "BOGUS_TYPE"}
    r = client.post(f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls", json=payload)
    assert r.status_code == 422
