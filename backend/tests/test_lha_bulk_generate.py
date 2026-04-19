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
    # designators are assigned from available letters
    for lha in generated:
        assert lha["unit_designator"] in ("A", "B", "C", "D")


def test_bulk_generate_caps_at_available_designators(client):
    """bulk-generate is capped at 4 (available designator slots A-D)."""
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
    # capped by 4 available designators even though distance would produce more
    assert len(generated) == 4
    designators = {lha["unit_designator"] for lha in generated}
    assert designators == {"A", "B", "C", "D"}


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


def test_bulk_generate_caps_at_designators_not_200(client):
    """designator limit (4) is tighter than the 200 cap."""
    apt_id, surface_id, agl_id = _setup(client, "LZCP")

    # ~2200m at 1m spacing - would exceed 200 cap, but designators cap at 4
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
    assert len(generated) == 4


def test_bulk_generate_rejects_when_all_designators_occupied(client):
    """bulk-generate rejects when all 4 designator slots are occupied."""
    apt_id, surface_id, agl_id = _setup(client, "LZDO")

    # create 4 individual LHAs to occupy all designator slots
    for designator in ("A", "B", "C", "D"):
        client.post(
            f"/api/v1/airports/{apt_id}/surfaces/{surface_id}/agls/{agl_id}/lhas",
            json={
                "unit_designator": designator,
                "lamp_type": "HALOGEN",
                "position": {"type": "Point", "coordinates": [14.2700, 50.1000, 380.0]},
            },
        )

    body = {
        "first_position": {"type": "Point", "coordinates": [14.2700, 50.1000, 380.0]},
        "last_position": {"type": "Point", "coordinates": [14.2704, 50.1000, 380.0]},
        "spacing_m": 10.0,
    }
    r = client.post(
        f"/api/v1/airports/{apt_id}/surfaces/{surface_id}/agls/{agl_id}/lhas/bulk",
        json=body,
    )
    assert r.status_code == 422
    assert "designator" in r.json()["detail"].lower()


def test_bulk_generate_cumulative_cap_across_calls(client):
    """second call rejected after first call exhausts all designators."""
    apt_id, surface_id, agl_id = _setup(client, "LZCC")

    # first call uses all 4 designators
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
    assert len(r1.json()["generated"]) == 4

    # second call must be rejected - all designator slots occupied
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
    assert "designator" in r2.json()["detail"].lower()
