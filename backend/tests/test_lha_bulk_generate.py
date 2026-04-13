from tests.data.airports import AGL_PAYLOAD, AIRPORT_PAYLOAD, SURFACE_PAYLOAD


def _setup(client, icao: str, agl_type: str = "RUNWAY_EDGE_LIGHTS"):
    """create airport + surface + agl; return ids."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": icao},
    ).json()
    surface = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=SURFACE_PAYLOAD).json()
    agl = client.post(
        f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls",
        json={**AGL_PAYLOAD, "agl_type": agl_type, "name": "edge-lights"},
    ).json()
    return apt["id"], surface["id"], agl["id"]


def test_bulk_generate_edge_lights_lhas(client):
    """bulk-generate LHAs for edge lights - setting_angle defaults to 0."""
    apt_id, surface_id, agl_id = _setup(client, "LZBG")

    # first and last ~30m apart at spacing 10m -> ~4 LHAs
    body = {
        "first_position": {"type": "Point", "coordinates": [14.2700, 50.1000, 380.0]},
        "last_position": {"type": "Point", "coordinates": [14.2704, 50.1000, 380.0]},
        "spacing_m": 10.0,
    }
    r = client.post(
        f"/api/v1/airports/{apt_id}/surfaces/{surface_id}/agls/{agl_id}/lhas/bulk",
        json=body,
    )
    assert r.status_code == 201
    generated = r.json()["generated"]
    assert len(generated) >= 2
    # edge lights default to setting_angle = 0
    for lha in generated:
        assert lha["setting_angle"] == 0.0
        assert lha["lamp_type"] == "HALOGEN"
    # unit numbers are sequential starting from 1
    unit_numbers = [lha["unit_number"] for lha in generated]
    assert unit_numbers == list(range(1, len(generated) + 1))


def test_bulk_generate_custom_spacing_produces_many(client):
    """longer distance with smaller spacing produces more LHAs."""
    apt_id, surface_id, agl_id = _setup(client, "LZBM")

    body = {
        "first_position": {"type": "Point", "coordinates": [14.2700, 50.1000, 380.0]},
        "last_position": {"type": "Point", "coordinates": [14.2750, 50.1000, 380.0]},
        "spacing_m": 5.0,
    }
    r = client.post(
        f"/api/v1/airports/{apt_id}/surfaces/{surface_id}/agls/{agl_id}/lhas/bulk",
        json=body,
    )
    assert r.status_code == 201
    generated = r.json()["generated"]
    # ~357m / 5m = ~71 LHAs expected
    assert len(generated) > 50
    assert len(generated) <= 200


def test_bulk_generate_rejects_same_position(client):
    """first == last position is a 422."""
    apt_id, surface_id, agl_id = _setup(client, "LZSP")

    body = {
        "first_position": {"type": "Point", "coordinates": [14.2700, 50.1000, 380.0]},
        "last_position": {"type": "Point", "coordinates": [14.2700, 50.1000, 380.0]},
        "spacing_m": 10.0,
    }
    r = client.post(
        f"/api/v1/airports/{apt_id}/surfaces/{surface_id}/agls/{agl_id}/lhas/bulk",
        json=body,
    )
    assert r.status_code == 422
