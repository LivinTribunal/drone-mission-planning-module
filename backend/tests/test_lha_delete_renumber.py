from tests.data.airports import AGL_PAYLOAD, AIRPORT_PAYLOAD, LHA_PAYLOAD, SURFACE_PAYLOAD

DESIGNATORS = ["A", "B", "C", "D"]


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
    for i in range(4):
        r = client.post(base, json={**LHA_PAYLOAD, "unit_designator": DESIGNATORS[i]})
        lhas.append(r.json())
    return apt["id"], surface["id"], agl["id"], base, lhas


def test_delete_lha_preserves_designators(client):
    """deleting an LHA does not alter remaining designators."""
    _, _, _, base, lhas = _setup(client, "LZDR")

    # delete LHA C (index 2)
    r = client.delete(f"{base}/{lhas[2]['id']}")
    assert r.status_code == 200

    remaining = client.get(base).json()["data"]
    assert len(remaining) == 3
    designators = sorted(lha["unit_designator"] for lha in remaining)
    assert designators == ["A", "B", "D"]


def test_delete_last_lha(client):
    """deleting the last LHA leaves others unchanged."""
    _, _, _, base, lhas = _setup(client, "LZDL")

    r = client.delete(f"{base}/{lhas[-1]['id']}")
    assert r.status_code == 200

    remaining = client.get(base).json()["data"]
    assert len(remaining) == 3
    designators = sorted(lha["unit_designator"] for lha in remaining)
    assert designators == ["A", "B", "C"]


def test_delete_edge_lights_agl(client):
    """deletion works correctly for a RUNWAY_EDGE_LIGHTS AGL (setting_angle 0)."""
    apt = client.post("/api/v1/airports", json={**AIRPORT_PAYLOAD, "icao_code": "LZER"}).json()
    surface = client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=SURFACE_PAYLOAD).json()
    agl = client.post(
        f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls",
        json={**AGL_PAYLOAD, "agl_type": "RUNWAY_EDGE_LIGHTS", "name": "edge"},
    ).json()
    base = f"/api/v1/airports/{apt['id']}/surfaces/{surface['id']}/agls/{agl['id']}/lhas"

    lhas = []
    for i in range(3):
        r = client.post(
            base, json={**LHA_PAYLOAD, "unit_designator": DESIGNATORS[i], "setting_angle": 0.0}
        )
        lhas.append(r.json())

    # delete the middle LHA
    r = client.delete(f"{base}/{lhas[1]['id']}")
    assert r.status_code == 200

    remaining = client.get(base).json()["data"]
    assert len(remaining) == 2
    designators = sorted(lha["unit_designator"] for lha in remaining)
    assert designators == ["A", "C"]
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


def test_delete_lha_cleans_inspection_template_default_config(client, db_session):
    """deleting an LHA also cleans the default_config of any InspectionTemplate that references it.

    InspectionTemplate.targets is a many-to-many to AGL, not LHA - the LHA reference chain
    from templates goes through InspectionTemplate.default_config.lha_ids.
    """
    from app.models.inspection import InspectionConfiguration, InspectionTemplate

    _, _, _, base, lhas = _setup(client, "LZTM")
    deleted_id = lhas[1]["id"]

    # seed a template whose default_config references the lha about to be deleted
    cfg = InspectionConfiguration(lha_ids=[lhas[0]["id"], deleted_id, lhas[2]["id"]])
    db_session.add(cfg)
    db_session.flush()
    tpl = InspectionTemplate(
        name="edge-lights-template",
        description="template referencing lhas for test",
        default_config_id=cfg.id,
    )
    db_session.add(tpl)
    db_session.commit()
    tpl_id = tpl.id
    cfg_id = cfg.id

    r = client.delete(f"{base}/{deleted_id}")
    assert r.status_code == 200

    db_session.expire_all()
    refreshed_cfg = (
        db_session.query(InspectionConfiguration)
        .filter(InspectionConfiguration.id == cfg_id)
        .first()
    )
    assert deleted_id not in refreshed_cfg.lha_ids
    assert lhas[0]["id"] in refreshed_cfg.lha_ids
    assert lhas[2]["id"] in refreshed_cfg.lha_ids

    # template row itself is unchanged
    refreshed_tpl = (
        db_session.query(InspectionTemplate).filter(InspectionTemplate.id == tpl_id).first()
    )
    assert refreshed_tpl.name == "edge-lights-template"
    assert refreshed_tpl.default_config_id == cfg_id
