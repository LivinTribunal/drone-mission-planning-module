from tests.data.airports import AIRPORT_PAYLOAD
from tests.data.drones import DRONE_PAYLOAD


def _create_airport_and_profile(client, icao: str):
    """set up an airport + profile and return their ids."""
    apt_resp = client.post(
        "/api/v1/airports",
        json={**AIRPORT_PAYLOAD, "icao_code": icao},
    )
    assert apt_resp.status_code == 201, apt_resp.text
    apt = apt_resp.json()
    prof_resp = client.post(
        "/api/v1/drone-profiles",
        json={**DRONE_PAYLOAD, "name": f"Profile for {icao}"},
    )
    assert prof_resp.status_code == 201, prof_resp.text
    profile = prof_resp.json()
    return apt["id"], profile["id"]


def test_create_drone_under_airport(client):
    """operator creates a fleet drone at an airport using a template."""
    airport_id, profile_id = _create_airport_and_profile(client, "LTDA")

    resp = client.post(
        f"/api/v1/airports/{airport_id}/drones",
        json={"drone_profile_id": profile_id, "name": "Fleet Unit 1"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Fleet Unit 1"
    assert body["airport_id"] == airport_id
    assert body["drone_profile_id"] == profile_id
    assert body["drone_profile"]["id"] == profile_id


def test_list_drones_scoped_to_airport(client):
    """list returns fleet drones only for the given airport."""
    apt_a, profile_id = _create_airport_and_profile(client, "LTDB")
    apt_b, _ = _create_airport_and_profile(client, "LTDC")

    client.post(
        f"/api/v1/airports/{apt_a}/drones",
        json={"drone_profile_id": profile_id, "name": "Alpha"},
    )
    client.post(
        f"/api/v1/airports/{apt_b}/drones",
        json={"drone_profile_id": profile_id, "name": "Bravo"},
    )

    body = client.get(f"/api/v1/airports/{apt_a}/drones").json()
    names = {d["name"] for d in body["data"]}
    assert "Alpha" in names
    assert "Bravo" not in names


def test_create_drone_duplicate_name_rejected(client):
    """(airport, name) uniqueness is enforced."""
    airport_id, profile_id = _create_airport_and_profile(client, "LTDE")
    ok = client.post(
        f"/api/v1/airports/{airport_id}/drones",
        json={"drone_profile_id": profile_id, "name": "Dup"},
    )
    assert ok.status_code == 201

    conflict = client.post(
        f"/api/v1/airports/{airport_id}/drones",
        json={"drone_profile_id": profile_id, "name": "Dup"},
    )
    assert conflict.status_code == 409


def test_delete_drone_blocked_when_missions_reference_it(client):
    """deletion is blocked while missions still assign the drone."""
    airport_id, profile_id = _create_airport_and_profile(client, "LTDF")
    drone = client.post(
        f"/api/v1/airports/{airport_id}/drones",
        json={"drone_profile_id": profile_id, "name": "Blocked"},
    ).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "holds drone",
            "airport_id": airport_id,
            "drone_id": drone["id"],
        },
    )
    assert mission.status_code == 201

    resp = client.delete(f"/api/v1/airports/{airport_id}/drones/{drone['id']}")
    assert resp.status_code == 409


def test_update_drone_metadata(client):
    """update adjusts fleet metadata without touching template specs."""
    airport_id, profile_id = _create_airport_and_profile(client, "LTDG")
    drone = client.post(
        f"/api/v1/airports/{airport_id}/drones",
        json={"drone_profile_id": profile_id, "name": "Original"},
    ).json()

    resp = client.put(
        f"/api/v1/airports/{airport_id}/drones/{drone['id']}",
        json={"name": "Renamed", "serial_number": "SN-42", "notes": "tail tag"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Renamed"
    assert body["serial_number"] == "SN-42"
    assert body["notes"] == "tail tag"


def test_mission_drone_id_round_trip(client):
    """mission create+read exposes both drone_id and legacy drone_profile_id."""
    airport_id, profile_id = _create_airport_and_profile(client, "LTDH")
    drone = client.post(
        f"/api/v1/airports/{airport_id}/drones",
        json={"drone_profile_id": profile_id, "name": "LZ7 Fleet"},
    ).json()

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "drone_id round trip",
            "airport_id": airport_id,
            "drone_id": drone["id"],
        },
    ).json()

    assert mission["drone_id"] == drone["id"]
    assert mission["drone_profile_id"] == profile_id


def test_delete_drone_profile_blocked_by_fleet_drones(client):
    """deleting a template referenced by fleet drones returns 409."""
    airport_id, profile_id = _create_airport_and_profile(client, "LTDI")
    fleet = client.post(
        f"/api/v1/airports/{airport_id}/drones",
        json={"drone_profile_id": profile_id, "name": "Tail-1"},
    )
    assert fleet.status_code == 201

    resp = client.delete(f"/api/v1/drone-profiles/{profile_id}")
    assert resp.status_code == 409
    body = resp.json()
    assert "fleet drones still reference it" in body["detail"]
    assert "Tail-1" in body["detail"]


def test_mission_create_with_legacy_drone_profile_id_materializes_fleet_drone(client):
    """POST /missions with legacy drone_profile_id auto-creates a fleet drone."""
    airport_id, profile_id = _create_airport_and_profile(client, "LTDJ")

    # no fleet drone exists yet at this airport
    fleet = client.get(f"/api/v1/airports/{airport_id}/drones").json()
    assert fleet["data"] == []

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "legacy-only payload",
            "airport_id": airport_id,
            "drone_profile_id": profile_id,
        },
    )
    assert mission.status_code == 201, mission.text
    body = mission.json()
    assert body["drone_id"] is not None
    assert body["drone_profile_id"] == profile_id

    # the auto-materialized drone is now visible in the fleet listing
    fleet_after = client.get(f"/api/v1/airports/{airport_id}/drones").json()
    assert len(fleet_after["data"]) == 1
    assert fleet_after["data"][0]["id"] == body["drone_id"]
    assert fleet_after["data"][0]["drone_profile_id"] == profile_id

    # a second legacy create at the same airport reuses the existing drone
    mission_b = client.post(
        "/api/v1/missions",
        json={
            "name": "legacy-only second",
            "airport_id": airport_id,
            "drone_profile_id": profile_id,
        },
    ).json()
    assert mission_b["drone_id"] == body["drone_id"]


def test_bulk_change_drone_with_legacy_from_drone_profile_id_filter(client):
    """bulk-change-drone using from_drone_profile_id filters by template lineage."""
    airport_id, profile_a = _create_airport_and_profile(client, "LTDK")
    profile_b = client.post(
        "/api/v1/drone-profiles",
        json={**DRONE_PAYLOAD, "name": "Profile B for LTDK"},
    ).json()["id"]

    drone_a = client.post(
        f"/api/v1/airports/{airport_id}/drones",
        json={"drone_profile_id": profile_a, "name": "Source Drone"},
    ).json()
    drone_b = client.post(
        f"/api/v1/airports/{airport_id}/drones",
        json={"drone_profile_id": profile_b, "name": "Target Drone"},
    ).json()

    # mission on the source profile - should be reassigned
    mission_src = client.post(
        "/api/v1/missions",
        json={
            "name": "src",
            "airport_id": airport_id,
            "drone_id": drone_a["id"],
        },
    ).json()
    # mission on the target profile - should be skipped by the legacy filter
    mission_other = client.post(
        "/api/v1/missions",
        json={
            "name": "other",
            "airport_id": airport_id,
            "drone_id": drone_b["id"],
        },
    ).json()

    resp = client.post(
        f"/api/v1/airports/{airport_id}/bulk-change-drone",
        json={
            "drone_id": drone_b["id"],
            "from_drone_profile_id": profile_a,
            "scope": "ALL_DRAFT",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["updated_count"] == 1
    assert mission_src["id"] in body["mission_ids"]
    assert mission_other["id"] not in body["mission_ids"]


def test_mission_update_can_clear_drone_assignment(client):
    """PATCH/PUT mission with drone_id=null clears, does not fall back to airport default."""
    airport_id, profile_id = _create_airport_and_profile(client, "LTDL")
    fleet_default = client.post(
        f"/api/v1/airports/{airport_id}/drones",
        json={"drone_profile_id": profile_id, "name": "Default Unit"},
    ).json()
    other = client.post(
        f"/api/v1/airports/{airport_id}/drones",
        json={"drone_profile_id": profile_id, "name": "Other Unit"},
    ).json()

    set_default = client.put(
        f"/api/v1/airports/{airport_id}/default-drone",
        json={"drone_id": fleet_default["id"]},
    )
    assert set_default.status_code == 200

    mission = client.post(
        "/api/v1/missions",
        json={
            "name": "clearable",
            "airport_id": airport_id,
            "drone_id": other["id"],
        },
    ).json()
    assert mission["drone_id"] == other["id"]

    cleared = client.put(
        f"/api/v1/missions/{mission['id']}",
        json={"drone_id": None},
    )
    assert cleared.status_code == 200, cleared.text
    body = cleared.json()
    assert body["drone_id"] is None
    assert body["drone_profile_id"] is None
