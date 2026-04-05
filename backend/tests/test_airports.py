from tests.data.airports import (
    AGL_PAYLOAD,
    AIRPORT_PAYLOAD,
    AIRPORT_UPDATE_PAYLOAD,
    LHA_PAYLOAD,
    OBSTACLE_PAYLOAD,
    SAFETY_ZONE_PAYLOAD,
    SURFACE_PAYLOAD,
    THROWAWAY_AIRPORT_PAYLOAD,
)
from tests.data.drones import DRONE_PAYLOAD


# Tests
def test_create_airport(client):
    """create an airport and verify response."""
    r = client.post("/api/v1/airports", json=AIRPORT_PAYLOAD)
    assert r.status_code == 201
    data = r.json()
    assert data["icao_code"] == "LKPR"
    assert data["name"] == "Prague Airport"
    assert "id" in data


def test_list_airports(client):
    """list airports and verify pagination metadata."""
    r = client.get("/api/v1/airports")
    assert r.status_code == 200
    body = r.json()
    assert body["meta"]["total"] >= 1
    assert any(a["icao_code"] == "LKPR" for a in body["data"])


def test_get_airport_detail(client):
    """fetch airport detail with nested surfaces, obstacles, safety zones."""
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    r = client.get(f"/api/v1/airports/{airport_id}")
    assert r.status_code == 200
    data = r.json()
    assert "surfaces" in data
    assert "obstacles" in data
    assert "safety_zones" in data


def test_update_airport(client):
    """update airport name and verify response."""
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    r = client.put(f"/api/v1/airports/{airport_id}", json=AIRPORT_UPDATE_PAYLOAD)
    assert r.status_code == 200
    assert r.json()["name"] == "Vaclav Havel"


def test_create_surface(client):
    """create a surface under an airport."""
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    r = client.post(f"/api/v1/airports/{airport_id}/surfaces", json=SURFACE_PAYLOAD)
    assert r.status_code == 201
    assert r.json()["identifier"] == "06/24"


def test_create_obstacle(client):
    """create an obstacle under an airport."""
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    r = client.post(f"/api/v1/airports/{airport_id}/obstacles", json=OBSTACLE_PAYLOAD)
    assert r.status_code == 201
    assert r.json()["name"] == "Tower"


def test_create_safety_zone(client):
    """create a safety zone under an airport."""
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    r = client.post(f"/api/v1/airports/{airport_id}/safety-zones", json=SAFETY_ZONE_PAYLOAD)
    assert r.status_code == 201
    assert r.json()["name"] == "Prague CTR"


def test_create_agl_and_lha(client):
    """create an agl and nested lha under a surface."""
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


def test_surface_response_excludes_taxiway_width(client):
    """surface response should not contain taxiway_width field."""
    # create airport + surface to avoid ordering dependency
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LKTW"},
    ).json()

    client.post(f"/api/v1/airports/{apt['id']}/surfaces", json=SURFACE_PAYLOAD)
    surfaces = client.get(f"/api/v1/airports/{apt['id']}/surfaces").json()["data"]
    assert len(surfaces) >= 1

    for surface in surfaces:
        assert "taxiway_width" not in surface


def test_create_airport_invalid_icao(client):
    """reject airports with invalid ICAO codes."""
    invalid_codes = ["lkpr", "LKP", "LK12", "LKPRX"]
    for code in invalid_codes:
        payload = {**AIRPORT_PAYLOAD, "icao_code": code}
        r = client.post("/api/v1/airports", json=payload)
        assert r.status_code == 422, f"expected 422 for ICAO '{code}', got {r.status_code}"


def test_airports_summary(client):
    """fetch airports summary with counts."""
    r = client.get("/api/v1/airports/summary")
    assert r.status_code == 200
    body = r.json()
    assert body["meta"]["total"] >= 1
    item = body["data"][0]
    assert "surfaces_count" in item
    assert "agls_count" in item
    assert "missions_count" in item
    assert "city" in item
    assert "country" in item


def test_delete_airport(client):
    """delete an airport and verify 404 on re-fetch."""
    r = client.post("/api/v1/airports", json=THROWAWAY_AIRPORT_PAYLOAD)
    assert r.status_code == 201
    airport_id = r.json()["id"]

    r = client.delete(f"/api/v1/airports/{airport_id}")
    assert r.status_code == 200

    r = client.get(f"/api/v1/airports/{airport_id}")
    assert r.status_code == 404


def test_set_default_drone(client):
    """set and clear default drone on an airport."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LZDD"},
    ).json()

    drone = client.post(
        "/api/v1/drone-profiles",
        json={**DRONE_PAYLOAD, "name": "Default Drone Test"},
    ).json()

    # set default
    r = client.put(
        f"/api/v1/airports/{apt['id']}/default-drone",
        json={"drone_profile_id": drone["id"]},
    )
    assert r.status_code == 200
    assert r.json()["default_drone_profile_id"] == drone["id"]

    # verify on detail
    detail = client.get(f"/api/v1/airports/{apt['id']}").json()
    assert detail["default_drone_profile_id"] == drone["id"]

    # clear default
    r = client.put(
        f"/api/v1/airports/{apt['id']}/default-drone",
        json={"drone_profile_id": None},
    )
    assert r.status_code == 200
    assert r.json()["default_drone_profile_id"] is None


def test_set_default_drone_invalid_profile(client):
    """setting a nonexistent drone profile returns 400."""
    airports = client.get("/api/v1/airports").json()["data"]
    airport_id = airports[0]["id"]

    r = client.put(
        f"/api/v1/airports/{airport_id}/default-drone",
        json={"drone_profile_id": "00000000-0000-0000-0000-000000000000"},
    )
    assert r.status_code == 400


def test_bulk_change_drone(client):
    """bulk change drone on draft missions at an airport."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LZBC"},
    ).json()

    drone1 = client.post(
        "/api/v1/drone-profiles",
        json={**DRONE_PAYLOAD, "name": "Bulk Drone 1"},
    ).json()
    drone2 = client.post(
        "/api/v1/drone-profiles",
        json={**DRONE_PAYLOAD, "name": "Bulk Drone 2"},
    ).json()

    # create two draft missions
    m1 = client.post(
        "/api/v1/missions",
        json={"name": "BulkTest1", "airport_id": apt["id"], "drone_profile_id": drone1["id"]},
    ).json()
    m2 = client.post(
        "/api/v1/missions",
        json={"name": "BulkTest2", "airport_id": apt["id"], "drone_profile_id": drone1["id"]},
    ).json()

    # bulk change to drone2
    r = client.post(
        f"/api/v1/airports/{apt['id']}/bulk-change-drone",
        json={"drone_profile_id": drone2["id"]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["updated_count"] == 2
    assert m1["id"] in body["mission_ids"]
    assert m2["id"] in body["mission_ids"]


def test_bulk_change_drone_skips_non_draft(client, db_engine):
    """bulk change should not affect non-draft missions."""
    from sqlalchemy import text

    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LZSK"},
    ).json()

    drone1 = client.post(
        "/api/v1/drone-profiles",
        json={**DRONE_PAYLOAD, "name": "Skip Drone 1"},
    ).json()
    drone2 = client.post(
        "/api/v1/drone-profiles",
        json={**DRONE_PAYLOAD, "name": "Skip Drone 2"},
    ).json()

    m_draft = client.post(
        "/api/v1/missions",
        json={"name": "SkipDraft", "airport_id": apt["id"], "drone_profile_id": drone1["id"]},
    ).json()
    m_planned = client.post(
        "/api/v1/missions",
        json={"name": "SkipPlanned", "airport_id": apt["id"], "drone_profile_id": drone1["id"]},
    ).json()

    # force one mission to PLANNED status via raw sql
    with db_engine.connect() as conn:
        conn.execute(
            text("UPDATE mission SET status = 'PLANNED' WHERE id = :id"),
            {"id": m_planned["id"]},
        )
        conn.commit()

    r = client.post(
        f"/api/v1/airports/{apt['id']}/bulk-change-drone",
        json={"drone_profile_id": drone2["id"]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["updated_count"] == 1
    assert m_draft["id"] in body["mission_ids"]
    assert m_planned["id"] not in body["mission_ids"]

    # verify planned mission still has original drone
    planned_detail = client.get(f"/api/v1/missions/{m_planned['id']}").json()
    assert planned_detail["drone_profile_id"] == drone1["id"]


def test_mission_auto_fills_default_drone(client):
    """mission creation auto-fills drone from airport default."""
    apt = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": "LZAF"},
    ).json()

    drone = client.post(
        "/api/v1/drone-profiles",
        json={**DRONE_PAYLOAD, "name": "AutoFill Drone"},
    ).json()

    # set default drone
    client.put(
        f"/api/v1/airports/{apt['id']}/default-drone",
        json={"drone_profile_id": drone["id"]},
    )

    # create mission without specifying drone
    r = client.post(
        "/api/v1/missions",
        json={"name": "AutoFillTest", "airport_id": apt["id"]},
    )
    assert r.status_code == 201
    assert r.json()["drone_profile_id"] == drone["id"]
