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


def test_bulk_generate_papi_lhas_have_null_setting_angle(client):
    """PAPI bulk-generate leaves setting_angle null for coordinator fill-in per lha."""
    apt_id, surface_id, agl_id = _setup(client, "LZPN", agl_type="PAPI")

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
    for lha in generated:
        assert lha["setting_angle"] is None
        assert lha["lamp_type"] == "HALOGEN"


def test_bulk_generate_edge_lights_setting_angle_is_zero_not_null(client):
    """RUNWAY_EDGE_LIGHTS bulk-generate uses 0.0 (not null) as the default setting_angle."""
    apt_id, surface_id, agl_id = _setup(client, "LZEZ", agl_type="RUNWAY_EDGE_LIGHTS")

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
    for lha in generated:
        assert lha["setting_angle"] == 0.0


def test_bulk_generate_caps_at_200(client):
    """distance that would produce >200 LHAs is silently capped at 200."""
    apt_id, surface_id, agl_id = _setup(client, "LZCP")

    # ~2200m at 1m spacing - far exceeds the 200 cap
    body = {
        "first_position": {"type": "Point", "coordinates": [14.2700, 50.1000, 380.0]},
        "last_position": {"type": "Point", "coordinates": [14.3000, 50.1000, 380.0]},
        "spacing_m": 1.0,
    }
    r = client.post(
        f"/api/v1/airports/{apt_id}/surfaces/{surface_id}/agls/{agl_id}/lhas/bulk",
        json=body,
    )
    assert r.status_code == 201
    generated = r.json()["generated"]
    assert len(generated) == 200


def test_bulk_generate_cumulative_cap_across_calls(client):
    """second call cannot push cumulative LHA count past 200."""
    apt_id, surface_id, agl_id = _setup(client, "LZCC")

    # first call fills up to the 200 cap
    first_body = {
        "first_position": {"type": "Point", "coordinates": [14.2700, 50.1000, 380.0]},
        "last_position": {"type": "Point", "coordinates": [14.3000, 50.1000, 380.0]},
        "spacing_m": 1.0,
    }
    r1 = client.post(
        f"/api/v1/airports/{apt_id}/surfaces/{surface_id}/agls/{agl_id}/lhas/bulk",
        json=first_body,
    )
    assert r1.status_code == 201
    assert len(r1.json()["generated"]) == 200

    # second call must be rejected - cap already reached
    second_body = {
        "first_position": {"type": "Point", "coordinates": [14.3001, 50.1000, 380.0]},
        "last_position": {"type": "Point", "coordinates": [14.3010, 50.1000, 380.0]},
        "spacing_m": 1.0,
    }
    r2 = client.post(
        f"/api/v1/airports/{apt_id}/surfaces/{surface_id}/agls/{agl_id}/lhas/bulk",
        json=second_body,
    )
    assert r2.status_code == 422
    assert "200" in r2.json()["detail"]
