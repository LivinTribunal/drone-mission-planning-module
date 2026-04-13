from tests.data.airports import AIRPORT_PAYLOAD, SURFACE_PAYLOAD


def test_surface_create_with_touchpoint(client):
    """create a surface with touchpoint coordinates."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LZTP"},
    ).json()

    payload = {
        **SURFACE_PAYLOAD,
        "touchpoint_latitude": 50.095,
        "touchpoint_longitude": 14.265,
        "touchpoint_altitude": 380.0,
    }
    r = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=payload)
    assert r.status_code == 201
    data = r.json()
    assert data["touchpoint_latitude"] == 50.095
    assert data["touchpoint_longitude"] == 14.265
    assert data["touchpoint_altitude"] == 380.0


def test_surface_update_touchpoint(client):
    """update touchpoint on an existing surface."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LZTU"},
    ).json()
    surface = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=SURFACE_PAYLOAD).json()

    r = client.put(
        f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}",
        json={
            "touchpoint_latitude": 50.100,
            "touchpoint_longitude": 14.270,
            "touchpoint_altitude": 381.5,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["touchpoint_latitude"] == 50.100
    assert data["touchpoint_longitude"] == 14.270
    assert data["touchpoint_altitude"] == 381.5


def test_surface_without_touchpoint_null(client):
    """touchpoint fields default to null when not provided."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LZTN"},
    ).json()
    r = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=SURFACE_PAYLOAD)
    assert r.status_code == 201
    data = r.json()
    assert data["touchpoint_latitude"] is None
    assert data["touchpoint_longitude"] is None
    assert data["touchpoint_altitude"] is None


def test_surface_partial_touchpoint_rejected(client):
    """providing only some touchpoint fields is a 422."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LZTX"},
    ).json()
    payload = {**SURFACE_PAYLOAD, "touchpoint_latitude": 50.1}
    r = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=payload)
    assert r.status_code == 422


def test_surface_update_partial_touchpoint_rejected(client):
    """updating with only some touchpoint fields is a 422."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LZTY"},
    ).json()
    surface = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=SURFACE_PAYLOAD).json()
    r = client.put(
        f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}",
        json={"touchpoint_latitude": 50.1, "touchpoint_longitude": 14.2},
    )
    assert r.status_code == 422


def test_surface_update_partial_null_touchpoint_rejected(client):
    """explicit null on only one touchpoint field leaves partial state - must 422."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LZTZ"},
    ).json()
    payload = {
        **SURFACE_PAYLOAD,
        "touchpoint_latitude": 50.095,
        "touchpoint_longitude": 14.265,
        "touchpoint_altitude": 380.0,
    }
    surface = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=payload).json()
    # only one field present and set to null - would previously slip past value-count check
    r = client.put(
        f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}",
        json={"touchpoint_latitude": None},
    )
    assert r.status_code == 422


def test_surface_update_all_touchpoint_null_accepted(client):
    """clearing all three touchpoint fields at once is a valid update."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LZTC"},
    ).json()
    payload = {
        **SURFACE_PAYLOAD,
        "touchpoint_latitude": 50.095,
        "touchpoint_longitude": 14.265,
        "touchpoint_altitude": 380.0,
    }
    surface = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=payload).json()
    r = client.put(
        f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}",
        json={
            "touchpoint_latitude": None,
            "touchpoint_longitude": None,
            "touchpoint_altitude": None,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["touchpoint_latitude"] is None
    assert data["touchpoint_longitude"] is None
    assert data["touchpoint_altitude"] is None
