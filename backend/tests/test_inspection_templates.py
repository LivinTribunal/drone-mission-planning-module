from tests.data.templates import TEMPLATE_PAYLOAD


# Tests
def test_create_template(client):
    """test create inspection template"""
    response = client.post("/api/v1/inspection-templates", json=TEMPLATE_PAYLOAD)
    assert response.status_code == 201
    data = response.json()

    assert data["name"] == "PAPI Angular Sweep"
    assert data["methods"] == ["ANGULAR_SWEEP"]
    assert data["default_config"]["speed_override"] == 5.0


def test_list_templates(client):
    """test list inspection templates"""
    response = client.get("/api/v1/inspection-templates")
    assert response.status_code == 200
    body = response.json()

    assert body["meta"]["total"] >= 1


def test_get_template(client):
    """test get inspection template"""
    templates = client.get("/api/v1/inspection-templates").json()["data"]
    template_id = templates[0]["id"]

    response = client.get(f"/api/v1/inspection-templates/{template_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "PAPI Angular Sweep"


def test_update_template(client):
    """test update inspection template"""
    templates = client.get("/api/v1/inspection-templates").json()["data"]
    template_id = templates[0]["id"]

    response = client.put(
        f"/api/v1/inspection-templates/{template_id}",
        json={"name": "Updated Sweep", "methods": ["ANGULAR_SWEEP", "VERTICAL_PROFILE"]},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["name"] == "Updated Sweep"
    assert len(data["methods"]) == 2


def test_delete_template(client):
    """test delete inspection template"""
    # create throwaway
    payload = {"name": "Temp Template", "methods": []}
    response = client.post("/api/v1/inspection-templates", json=payload)
    template_id = response.json()["id"]

    response = client.delete(f"/api/v1/inspection-templates/{template_id}")
    assert response.status_code == 200
