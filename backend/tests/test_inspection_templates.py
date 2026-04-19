from tests.data.templates import (
    TEMPLATE_PAYLOAD,
    TEMPLATE_UPDATE_PAYLOAD,
    THROWAWAY_TEMPLATE_PAYLOAD,
)


# Tests
def test_create_template(client):
    """test create inspection template"""
    response = client.post("/api/v1/inspection-templates", json=TEMPLATE_PAYLOAD)
    assert response.status_code == 201
    data = response.json()

    assert data["name"] == "Horizontal Range"
    assert data["methods"] == ["HORIZONTAL_RANGE"]
    assert data["default_config"]["measurement_density"] == 10


def test_list_templates(client):
    """test list inspection templates"""
    response = client.get("/api/v1/inspection-templates")
    assert response.status_code == 200
    body = response.json()

    assert body["meta"]["total"] >= 1


def test_get_template(client):
    """test get inspection template"""
    created = client.post("/api/v1/inspection-templates", json=TEMPLATE_PAYLOAD).json()
    template_id = created["id"]

    response = client.get(f"/api/v1/inspection-templates/{template_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Horizontal Range"


def test_update_template(client):
    """test update inspection template"""
    templates = client.get("/api/v1/inspection-templates").json()["data"]
    template_id = templates[0]["id"]

    response = client.put(
        f"/api/v1/inspection-templates/{template_id}",
        json=TEMPLATE_UPDATE_PAYLOAD,
    )
    assert response.status_code == 200
    data = response.json()

    assert data["name"] == "Updated Sweep"
    assert len(data["methods"]) == 2


def test_delete_template(client):
    """test delete inspection template"""
    # create throwaway
    response = client.post("/api/v1/inspection-templates", json=THROWAWAY_TEMPLATE_PAYLOAD)
    template_id = response.json()["id"]

    response = client.delete(f"/api/v1/inspection-templates/{template_id}")
    assert response.status_code == 200
