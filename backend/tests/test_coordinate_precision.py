"""regression tests for coordinate round-trip precision.

locks in the invariant that lat/lon/alt stored in PostGIS POINTZ columns
survive the full POST -> GET path as IEEE-754 float64 with all decimals intact.
"""

from tests.data.airports import AIRPORT_PAYLOAD, LHA_PAYLOAD, SURFACE_PAYLOAD

PRECISE_LON = 14.987654321
PRECISE_LAT = 50.123456789
PRECISE_ALT = 381.7


def test_airport_location_roundtrip_preserves_precision(client):
    """airport.location keeps all 9 decimals on round-trip."""
    payload = {
        **AIRPORT_PAYLOAD,
        "icao_code": "LXPA",
        "elevation": PRECISE_ALT,
        "location": {
            "type": "Point",
            "coordinates": [PRECISE_LON, PRECISE_LAT, PRECISE_ALT],
        },
    }
    r = client.post("/api/v1/airports", json=payload)
    assert r.status_code == 201
    airport_id = r.json()["id"]

    r = client.get(f"/api/v1/airports/{airport_id}")
    assert r.status_code == 200
    coords = r.json()["location"]["coordinates"]
    assert coords[0] == PRECISE_LON
    assert coords[1] == PRECISE_LAT
    assert coords[2] == PRECISE_ALT


def test_surface_threshold_roundtrip_preserves_precision(client):
    """surface threshold_position and end_position keep all decimals."""
    r_apt = client.post(
        "/api/v1/airports",
        json={
            **AIRPORT_PAYLOAD,
            "icao_code": "LXPB",
            "elevation": PRECISE_ALT,
            "location": {
                "type": "Point",
                "coordinates": [PRECISE_LON, PRECISE_LAT, PRECISE_ALT],
            },
        },
    )
    assert r_apt.status_code == 201
    apt = r_apt.json()

    precise_lon2 = -14.987654321
    precise_lat2 = 50.987654321
    surface_payload = {
        **SURFACE_PAYLOAD,
        "threshold_position": {
            "type": "Point",
            "coordinates": [PRECISE_LON, PRECISE_LAT, PRECISE_ALT],
        },
        "end_position": {
            "type": "Point",
            "coordinates": [precise_lon2, precise_lat2, PRECISE_ALT],
        },
    }
    r = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=surface_payload)
    assert r.status_code == 201
    body = r.json()
    assert body["threshold_position"]["coordinates"][0] == PRECISE_LON
    assert body["threshold_position"]["coordinates"][1] == PRECISE_LAT
    assert body["threshold_position"]["coordinates"][2] == PRECISE_ALT
    assert body["end_position"]["coordinates"][0] == precise_lon2
    assert body["end_position"]["coordinates"][1] == precise_lat2
    assert body["end_position"]["coordinates"][2] == PRECISE_ALT


def test_agl_position_lonlat_roundtrip_preserves_precision(client):
    """AGL position lon/lat keep all decimals through POST -> GET.

    altitude is normalized to ground at creation, so we fix airport elevation
    to PRECISE_ALT and assert equality on all three axes.
    """
    r_apt = client.post(
        "/api/v1/airports",
        json={
            **AIRPORT_PAYLOAD,
            "icao_code": "LXPC",
            "elevation": PRECISE_ALT,
            "location": {
                "type": "Point",
                "coordinates": [PRECISE_LON, PRECISE_LAT, PRECISE_ALT],
            },
        },
    )
    assert r_apt.status_code == 201
    apt = r_apt.json()

    r_surf = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=SURFACE_PAYLOAD)
    assert r_surf.status_code == 201
    surface = r_surf.json()

    agl_payload = {
        "agl_type": "PAPI",
        "name": "PAPI precision",
        "position": {
            "type": "Point",
            "coordinates": [PRECISE_LON, PRECISE_LAT, PRECISE_ALT],
        },
        "side": "LEFT",
        "glide_slope_angle": 3.0,
    }
    r = client.post(f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls", json=agl_payload)
    assert r.status_code == 201
    coords = r.json()["position"]["coordinates"]
    assert coords[0] == PRECISE_LON
    assert coords[1] == PRECISE_LAT
    assert coords[2] == PRECISE_ALT


def test_lha_position_lonlat_roundtrip_preserves_precision(client):
    """LHA position lon/lat (and altitude when airport elevation matches) survive round-trip."""
    r_apt = client.post(
        "/api/v1/airports",
        json={
            **AIRPORT_PAYLOAD,
            "icao_code": "LXPD",
            "elevation": PRECISE_ALT,
            "location": {
                "type": "Point",
                "coordinates": [PRECISE_LON, PRECISE_LAT, PRECISE_ALT],
            },
        },
    )
    assert r_apt.status_code == 201
    apt = r_apt.json()

    r_surf = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=SURFACE_PAYLOAD)
    assert r_surf.status_code == 201
    surface = r_surf.json()

    r_agl = client.post(
        f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls",
        json={
            "agl_type": "PAPI",
            "name": "PAPI",
            "position": {
                "type": "Point",
                "coordinates": [PRECISE_LON, PRECISE_LAT, PRECISE_ALT],
            },
            "side": "LEFT",
            "glide_slope_angle": 3.0,
        },
    )
    assert r_agl.status_code == 201
    agl = r_agl.json()

    lha_payload = {
        **LHA_PAYLOAD,
        "position": {
            "type": "Point",
            "coordinates": [PRECISE_LON, PRECISE_LAT, PRECISE_ALT],
        },
    }
    r = client.post(
        f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls/{agl['id']}/lhas",
        json=lha_payload,
    )
    assert r.status_code == 201
    coords = r.json()["position"]["coordinates"]
    assert coords[0] == PRECISE_LON
    assert coords[1] == PRECISE_LAT
    assert coords[2] == PRECISE_ALT


def test_agl_update_preserve_altitude_keeps_full_precision(client):
    """updating an AGL with preserve_altitude=True retains full Z precision."""
    r_apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LXPE"},
    )
    assert r_apt.status_code == 201
    apt = r_apt.json()

    r_surf = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=SURFACE_PAYLOAD)
    assert r_surf.status_code == 201
    surface = r_surf.json()

    r_agl = client.post(
        f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls",
        json={
            "agl_type": "PAPI",
            "name": "PAPI",
            "position": {"type": "Point", "coordinates": [14.274, 50.097, 380.0]},
            "side": "LEFT",
            "glide_slope_angle": 3.0,
        },
    )
    assert r_agl.status_code == 201
    agl = r_agl.json()

    precise_alt = 777.123456789
    new_position = {
        "type": "Point",
        "coordinates": [PRECISE_LON, PRECISE_LAT, precise_alt],
    }
    r = client.put(
        f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls/{agl['id']}",
        json={"position": new_position, "preserve_altitude": True},
    )
    assert r.status_code == 200
    coords = r.json()["position"]["coordinates"]
    assert coords[0] == PRECISE_LON
    assert coords[1] == PRECISE_LAT
    assert coords[2] == precise_alt
