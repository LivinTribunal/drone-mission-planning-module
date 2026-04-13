from tests.data.airports import AGL_PAYLOAD, AIRPORT_PAYLOAD, LHA_PAYLOAD, SURFACE_PAYLOAD


def _setup(client, icao: str):
    """create airport + surface + agl + N lhas."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": icao},
    ).json()
    surface = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=SURFACE_PAYLOAD).json()
    agl = client.post(
        f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls", json=AGL_PAYLOAD
    ).json()

    base = f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls/{agl['id']}/lhas"
    lhas = []
    for i in range(1, 6):
        r = client.post(base, json={**LHA_PAYLOAD, "unit_number": i})
        lhas.append(r.json())
    return apt["id"], surface["id"], agl["id"], base, lhas


def test_delete_middle_lha_renumbers(client):
    """deleting a middle LHA renumbers remaining to stay contiguous."""
    _, _, _, base, lhas = _setup(client, "LZDR")

    # delete LHA 3 (index 2)
    r = client.delete(f"{base}/{lhas[2]['id']}")
    assert r.status_code == 200

    remaining = client.get(base).json()["data"]
    assert len(remaining) == 4
    unit_numbers = sorted(lha["unit_number"] for lha in remaining)
    assert unit_numbers == [1, 2, 3, 4]


def test_delete_last_lha_keeps_contiguous(client):
    """deleting the last LHA leaves 1..N-1 contiguous."""
    _, _, _, base, lhas = _setup(client, "LZDL")

    r = client.delete(f"{base}/{lhas[-1]['id']}")
    assert r.status_code == 200

    remaining = client.get(base).json()["data"]
    assert len(remaining) == 4
    unit_numbers = sorted(lha["unit_number"] for lha in remaining)
    assert unit_numbers == [1, 2, 3, 4]


def test_delete_renumber_edge_lights_agl(client):
    """renumber works correctly for a RUNWAY_EDGE_LIGHTS AGL (setting_angle 0)."""
    apt = client.post("/api/v1/airports", json={**AIRPORT_PAYLOAD, "icao_code": "LZER"}).json()
    surface = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=SURFACE_PAYLOAD).json()
    agl = client.post(
        f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls",
        json={**AGL_PAYLOAD, "agl_type": "RUNWAY_EDGE_LIGHTS", "name": "edge"},
    ).json()
    base = f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls/{agl['id']}/lhas"

    lhas = []
    for i in range(1, 4):
        r = client.post(base, json={**LHA_PAYLOAD, "unit_number": i, "setting_angle": 0.0})
        lhas.append(r.json())

    # delete the middle LHA - remaining should renumber to 1..2
    r = client.delete(f"{base}/{lhas[1]['id']}")
    assert r.status_code == 200

    remaining = client.get(base).json()["data"]
    assert len(remaining) == 2
    unit_numbers = sorted(lha["unit_number"] for lha in remaining)
    assert unit_numbers == [1, 2]
    for lha in remaining:
        assert lha["setting_angle"] == 0.0


def test_delete_lha_cleans_inspection_configs(client, db_session):
    """deleting an LHA removes it from any InspectionConfiguration.lha_ids."""
    from app.models.inspection import InspectionConfiguration

    _, _, _, base, lhas = _setup(client, "LZDC")
    deleted_id = lhas[1]["id"]

    # seed an inspection config that references the deleted lha
    cfg = InspectionConfiguration(lha_ids=[lhas[0]["id"], deleted_id, lhas[2]["id"]])
    db_session.add(cfg)
    db_session.commit()
    cfg_id = cfg.id

    r = client.delete(f"{base}/{deleted_id}")
    assert r.status_code == 200

    # re-query from a fresh session to see the committed state
    db_session.expire_all()
    refreshed = (
        db_session.query(InspectionConfiguration)
        .filter(InspectionConfiguration.id == cfg_id)
        .first()
    )
    assert deleted_id not in refreshed.lha_ids
    assert lhas[0]["id"] in refreshed.lha_ids
    assert lhas[2]["id"] in refreshed.lha_ids
