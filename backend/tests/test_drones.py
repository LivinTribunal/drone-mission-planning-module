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
