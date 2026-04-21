"""tests for camera preset CRUD api."""

PRESET_PAYLOAD = {
    "name": "PAPI Night - DJI M30T",
    "is_default": False,
    "white_balance": "TUNGSTEN",
    "iso": 800,
    "shutter_speed": "1/500",
    "focus_mode": "INFINITY",
}


def test_create_preset(client):
    """test creating a camera preset."""
    r = client.post("/api/v1/camera-presets", json=PRESET_PAYLOAD)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "PAPI Night - DJI M30T"
    assert data["white_balance"] == "TUNGSTEN"
    assert data["iso"] == 800
    assert data["focus_mode"] == "INFINITY"
    assert data["is_default"] is False
    assert data["created_by"] is not None


def test_list_presets(client):
    """test listing camera presets."""
    r = client.get("/api/v1/camera-presets")
    assert r.status_code == 200
    body = r.json()
    assert body["meta"]["total"] >= 1
    assert any(p["name"] == "PAPI Night - DJI M30T" for p in body["data"])


def test_list_presets_filter_is_default(client):
    """test filtering presets by is_default."""
    client.post(
        "/api/v1/camera-presets",
        json={**PRESET_PAYLOAD, "name": "Default Preset", "is_default": True},
    )

    r = client.get("/api/v1/camera-presets", params={"is_default": True})
    assert r.status_code == 200
    data = r.json()["data"]
    assert all(p["is_default"] is True for p in data)


def test_get_preset(client):
    """test getting a single preset."""
    presets = client.get("/api/v1/camera-presets").json()["data"]
    preset_id = presets[0]["id"]

    r = client.get(f"/api/v1/camera-presets/{preset_id}")
    assert r.status_code == 200
    assert r.json()["id"] == preset_id


def test_update_preset(client):
    """test updating a camera preset."""
    presets = client.get("/api/v1/camera-presets").json()["data"]
    preset_id = presets[0]["id"]

    r = client.put(
        f"/api/v1/camera-presets/{preset_id}",
        json={"iso": 1600, "shutter_speed": "1/1000"},
    )
    assert r.status_code == 200
    assert r.json()["iso"] == 1600
    assert r.json()["shutter_speed"] == "1/1000"


def test_update_preset_rejects_empty_body(client):
    """PUT with no fields is rejected as 422."""
    presets = client.get("/api/v1/camera-presets").json()["data"]
    preset_id = presets[0]["id"]
    r = client.put(f"/api/v1/camera-presets/{preset_id}", json={})
    assert r.status_code == 422


def test_update_preset_rejects_unknown_field(client):
    """PUT with an unknown field is rejected (extra='forbid')."""
    presets = client.get("/api/v1/camera-presets").json()["data"]
    preset_id = presets[0]["id"]
    r = client.put(f"/api/v1/camera-presets/{preset_id}", json={"optical_zoom": 5.0})
    assert r.status_code == 422


def test_delete_preset(client):
    """test deleting a camera preset."""
    r = client.post(
        "/api/v1/camera-presets",
        json={"name": "Throwaway Preset", "white_balance": "DAYLIGHT"},
    )
    preset_id = r.json()["id"]

    r = client.delete(f"/api/v1/camera-presets/{preset_id}")
    assert r.status_code == 200
    assert r.json()["deleted"] is True

    r = client.get(f"/api/v1/camera-presets/{preset_id}")
    assert r.status_code == 404


def test_create_preset_with_drone_profile(client):
    """test creating a preset tied to a drone profile."""
    drone = client.post("/api/v1/drone-profiles", json={"name": "Preset Test Drone"}).json()

    r = client.post(
        "/api/v1/camera-presets",
        json={**PRESET_PAYLOAD, "name": "Drone Specific", "drone_profile_id": drone["id"]},
    )
    assert r.status_code == 201
    assert r.json()["drone_profile_id"] == drone["id"]

    r = client.get("/api/v1/camera-presets", params={"drone_profile_id": drone["id"]})
    assert r.status_code == 200
    names = [p["name"] for p in r.json()["data"]]
    assert "Drone Specific" in names

    client.delete(f"/api/v1/drone-profiles/{drone['id']}")


def test_create_default_preset(client):
    """test creating a default preset (test user is super_admin)."""
    r = client.post(
        "/api/v1/camera-presets",
        json={
            "name": "Global Default",
            "is_default": True,
            "white_balance": "CLOUDY",
        },
    )
    assert r.status_code == 201
    assert r.json()["is_default"] is True


def test_get_nonexistent_preset(client):
    """test getting a preset that does not exist."""
    r = client.get("/api/v1/camera-presets/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


def test_only_one_default_per_drone_profile(client):
    """creating a second default for the same drone profile clears the first."""
    drone = client.post("/api/v1/drone-profiles", json={"name": "Uniq Default Drone"}).json()

    first = client.post(
        "/api/v1/camera-presets",
        json={
            "name": "First Default",
            "is_default": True,
            "drone_profile_id": drone["id"],
            "white_balance": "DAYLIGHT",
        },
    ).json()
    second = client.post(
        "/api/v1/camera-presets",
        json={
            "name": "Second Default",
            "is_default": True,
            "drone_profile_id": drone["id"],
            "white_balance": "CLOUDY",
        },
    ).json()

    assert client.get(f"/api/v1/camera-presets/{first['id']}").json()["is_default"] is False
    assert client.get(f"/api/v1/camera-presets/{second['id']}").json()["is_default"] is True

    client.delete(f"/api/v1/camera-presets/{first['id']}")
    client.delete(f"/api/v1/camera-presets/{second['id']}")
    client.delete(f"/api/v1/drone-profiles/{drone['id']}")


def test_update_to_default_clears_previous(client):
    """promoting a preset to default unseats any existing default on that profile."""
    drone = client.post("/api/v1/drone-profiles", json={"name": "Promote Default Drone"}).json()

    original = client.post(
        "/api/v1/camera-presets",
        json={
            "name": "Original Default",
            "is_default": True,
            "drone_profile_id": drone["id"],
            "white_balance": "DAYLIGHT",
        },
    ).json()
    challenger = client.post(
        "/api/v1/camera-presets",
        json={
            "name": "Challenger",
            "is_default": False,
            "drone_profile_id": drone["id"],
            "white_balance": "CLOUDY",
        },
    ).json()

    r = client.put(
        f"/api/v1/camera-presets/{challenger['id']}",
        json={"is_default": True},
    )
    assert r.status_code == 200

    assert client.get(f"/api/v1/camera-presets/{original['id']}").json()["is_default"] is False
    assert client.get(f"/api/v1/camera-presets/{challenger['id']}").json()["is_default"] is True

    client.delete(f"/api/v1/camera-presets/{original['id']}")
    client.delete(f"/api/v1/camera-presets/{challenger['id']}")
    client.delete(f"/api/v1/drone-profiles/{drone['id']}")


def test_get_preset_access_control(client, as_operator):
    """a non-owner operator cannot fetch another user's private preset."""
    private_preset_id = client.post(
        "/api/v1/camera-presets",
        json={"name": "Private Owner Preset", "white_balance": "DAYLIGHT"},
    ).json()["id"]

    r = client.post(
        "/api/v1/camera-presets",
        json={"name": "Public Default Preset", "is_default": True, "white_balance": "CLOUDY"},
    )
    assert r.status_code == 201, r.json()
    default_preset_id = r.json()["id"]

    with as_operator() as op_client:
        # operator sees private preset as 404 (not leaked via 403)
        assert op_client.get(f"/api/v1/camera-presets/{private_preset_id}").status_code == 404
        # operator CAN fetch a default preset
        r = op_client.get(f"/api/v1/camera-presets/{default_preset_id}")
        assert r.status_code == 200
        assert r.json()["id"] == default_preset_id


def test_update_preset_access_denied(client, as_operator):
    """a non-owner operator cannot update another user's preset."""
    preset_id = client.post(
        "/api/v1/camera-presets",
        json={"name": "Owner Only Update", "white_balance": "DAYLIGHT"},
    ).json()["id"]

    with as_operator() as op_client:
        r = op_client.put(
            f"/api/v1/camera-presets/{preset_id}",
            json={"iso": 3200},
        )
        assert r.status_code == 403


def test_operator_cannot_create_default(as_operator):
    """non-privileged users cannot create default presets."""
    with as_operator() as op_client:
        r = op_client.post(
            "/api/v1/camera-presets",
            json={"name": "Sneaky Default", "is_default": True, "white_balance": "DAYLIGHT"},
        )
        assert r.status_code == 403


def test_delete_preset_access_denied(client, as_operator):
    """a non-owner operator cannot delete another user's preset."""
    preset_id = client.post(
        "/api/v1/camera-presets",
        json={"name": "Owner Only Delete", "white_balance": "DAYLIGHT"},
    ).json()["id"]

    with as_operator() as op_client:
        r = op_client.delete(f"/api/v1/camera-presets/{preset_id}")
        assert r.status_code == 403

    # verify preset still exists (uses super admin client)
    r = client.get(f"/api/v1/camera-presets/{preset_id}")
    assert r.status_code == 200
