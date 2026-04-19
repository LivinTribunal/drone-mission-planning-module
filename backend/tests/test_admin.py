"""tests for super admin endpoints."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from testcontainers.postgres import PostgresContainer

import app.models  # noqa: F401
from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app
from app.models.airport import Airport
from app.models.enums import UserRole
from app.models.user import User
from app.services.seeder import seed_users


@pytest.fixture(scope="module")
def admin_engine():
    """dedicated postgis database for admin tests."""
    with PostgresContainer(
        image="postgis/postgis:16-3.4",
        username="test",
        password="test",
        dbname="test_admin",
    ) as pg:
        engine = create_engine(pg.get_connection_url())
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            conn.commit()

        Base.metadata.create_all(engine)
        yield engine
        Base.metadata.drop_all(engine)


@pytest.fixture(scope="module")
def admin_session_factory(admin_engine):
    """session factory for admin tests."""
    return sessionmaker(bind=admin_engine)


@pytest.fixture
def admin_db(admin_session_factory):
    """per-test session with rollback."""
    session = admin_session_factory()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture(scope="module")
def admin_client(admin_engine, admin_session_factory):
    """test client with db override."""

    def override_get_db():
        """test db override."""
        db = admin_session_factory()
        try:
            yield db
        finally:
            db.close()

    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    app.dependency_overrides.update(saved_overrides)


@pytest.fixture(scope="module")
def seeded_admin_client(admin_client, admin_session_factory):
    """admin client with seed users created."""
    original = settings.seed_users
    settings.seed_users = True
    db = admin_session_factory()
    try:
        seed_users(db)
    finally:
        db.close()
        settings.seed_users = original

    return admin_client


def _get_admin_token(client):
    """helper to get admin access token."""
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@tmv.com", "password": "adminadmin"},
    )
    return resp.json()["access_token"]


def _get_operator_token(client):
    """helper to get operator access token."""
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "operator@tmv.com", "password": "operator"},
    )
    return resp.json()["access_token"]


class TestAdminUserEndpoints:
    """test admin user management endpoints."""

    def test_list_users(self, seeded_admin_client):
        """admin can list all users."""
        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            "/api/v1/admin/users",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "meta" in data
        assert len(data["data"]) >= 3

    def test_list_users_filter_role(self, seeded_admin_client):
        """admin can filter users by role."""
        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            "/api/v1/admin/users?role=SUPER_ADMIN",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert all(u["role"] == "SUPER_ADMIN" for u in data)

    def test_list_users_search(self, seeded_admin_client):
        """admin can search users by name or email."""
        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            "/api/v1/admin/users?search=admin",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) >= 1

    def test_operator_cannot_list_users(self, seeded_admin_client):
        """operator role is blocked from admin endpoints."""
        token = _get_operator_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            "/api/v1/admin/users",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_invite_user(self, seeded_admin_client):
        """admin can invite a new user."""
        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.post(
            "/api/v1/admin/users/invite",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "email": "newinvite@tarmacview.com",
                "name": "New Invite",
                "role": "OPERATOR",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "invitation_link" in data
        assert data["user"]["email"] == "newinvite@tarmacview.com"
        assert data["user"]["is_active"] is False

    def test_invite_duplicate_email(self, seeded_admin_client):
        """inviting with existing email returns 409."""
        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.post(
            "/api/v1/admin/users/invite",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "email": "admin@tmv.com",
                "name": "Duplicate",
                "role": "OPERATOR",
            },
        )
        assert resp.status_code == 409

    def test_get_user(self, seeded_admin_client, admin_session_factory):
        """admin can get user detail."""
        db = admin_session_factory()
        try:
            user = db.query(User).filter(User.email == "operator@tmv.com").first()
            user_id = str(user.id)
        finally:
            db.close()

        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            f"/api/v1/admin/users/{user_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == "operator@tmv.com"

    def test_update_user(self, seeded_admin_client, admin_session_factory):
        """admin can update user fields."""
        db = admin_session_factory()
        try:
            user = db.query(User).filter(User.email == "operator@tmv.com").first()
            user_id = str(user.id)
        finally:
            db.close()

        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.put(
            f"/api/v1/admin/users/{user_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "Updated Operator"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Operator"

    def test_deactivate_and_activate_user(self, seeded_admin_client, admin_session_factory):
        """admin can deactivate and reactivate a user."""
        db = admin_session_factory()
        try:
            user = User(
                email="toggle@tarmacview.com",
                name="Toggle User",
                role=UserRole.OPERATOR.value,
                is_active=True,
            )
            user.set_password("toggle123")
            db.add(user)
            db.commit()
            user_id = str(user.id)
        finally:
            db.close()

        token = _get_admin_token(seeded_admin_client)

        resp = seeded_admin_client.put(
            f"/api/v1/admin/users/{user_id}/deactivate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

        resp = seeded_admin_client.put(
            f"/api/v1/admin/users/{user_id}/activate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True

    def test_delete_inactive_user(self, seeded_admin_client, admin_session_factory):
        """admin can delete an inactive user."""
        db = admin_session_factory()
        try:
            user = User(
                email="deleteme@tarmacview.com",
                name="Delete Me",
                role=UserRole.OPERATOR.value,
                is_active=False,
            )
            db.add(user)
            db.commit()
            user_id = str(user.id)
        finally:
            db.close()

        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.delete(
            f"/api/v1/admin/users/{user_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True

    def test_delete_active_user_blocked(self, seeded_admin_client, admin_session_factory):
        """cannot delete an active user."""
        db = admin_session_factory()
        try:
            user = User(
                email="nodelete@tarmacview.com",
                name="No Delete",
                role=UserRole.OPERATOR.value,
                is_active=True,
            )
            user.set_password("nodelete1")
            db.add(user)
            db.commit()
            user_id = str(user.id)
        finally:
            db.close()

        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.delete(
            f"/api/v1/admin/users/{user_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400

    def test_reset_password(self, seeded_admin_client, admin_session_factory):
        """admin can generate password reset link."""
        db = admin_session_factory()
        try:
            user = db.query(User).filter(User.email == "operator@tmv.com").first()
            user_id = str(user.id)
        finally:
            db.close()

        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.post(
            f"/api/v1/admin/users/{user_id}/reset-password",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert "invitation_link" in resp.json()

    def test_update_airport_assignments(self, seeded_admin_client, admin_session_factory):
        """admin can assign airports to a user."""
        db = admin_session_factory()
        try:
            airport = Airport(
                icao_code="ZZZZ",
                name="Test Airport",
                elevation=100.0,
                location="SRID=4326;POINTZ(17.0 48.0 100)",
            )
            db.add(airport)
            db.flush()
            airport_id = str(airport.id)

            user = db.query(User).filter(User.email == "operator@tmv.com").first()
            user_id = str(user.id)
            db.commit()
        finally:
            db.close()

        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.put(
            f"/api/v1/admin/users/{user_id}/airports",
            headers={"Authorization": f"Bearer {token}"},
            json={"airport_ids": [airport_id]},
        )
        assert resp.status_code == 200
        airports = resp.json()["airports"]
        assert any(a["id"] == airport_id for a in airports)


class TestSystemSettings:
    """test system settings endpoints."""

    def test_get_system_settings(self, seeded_admin_client):
        """admin can read system settings."""
        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            "/api/v1/admin/system-settings",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "maintenance_mode" in data
        assert "cesium_ion_token" in data
        assert "elevation_api_url" in data

    def test_update_system_settings(self, seeded_admin_client):
        """admin can update system settings."""
        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.put(
            "/api/v1/admin/system-settings",
            headers={"Authorization": f"Bearer {token}"},
            json={"maintenance_mode": False, "cesium_ion_token": "test-token"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["maintenance_mode"] is False
        assert data["cesium_ion_token"] == "test-token"

    def test_operator_cannot_access_settings(self, seeded_admin_client):
        """operator cannot access system settings."""
        token = _get_operator_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            "/api/v1/admin/system-settings",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


class TestAuditLog:
    """test audit log endpoints."""

    def test_list_audit_logs(self, seeded_admin_client):
        """admin can list audit logs."""
        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            "/api/v1/admin/audit-log",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "meta" in data

    def test_audit_log_has_login_entry(self, seeded_admin_client):
        """login creates audit log entry."""
        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            "/api/v1/admin/audit-log?action=LOGIN",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) >= 1
        assert data[0]["action"] == "LOGIN"

    def test_export_audit_log_csv(self, seeded_admin_client):
        """admin can export audit log as csv."""
        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            "/api/v1/admin/audit-log/export",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")

    def test_operator_cannot_access_audit_log(self, seeded_admin_client):
        """operator cannot access audit log."""
        token = _get_operator_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            "/api/v1/admin/audit-log",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    def test_system_settings_audit_redacts_token(self, seeded_admin_client):
        """cesium_ion_token is redacted in audit log details."""
        token = _get_admin_token(seeded_admin_client)
        seeded_admin_client.put(
            "/api/v1/admin/system-settings",
            headers={"Authorization": f"Bearer {token}"},
            json={"cesium_ion_token": "secret-token-value"},
        )
        resp = seeded_admin_client.get(
            "/api/v1/admin/audit-log?action=SYSTEM_SETTING_CHANGE",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        entries = resp.json()["data"]
        assert len(entries) >= 1
        details = entries[0]["details"]
        assert details.get("cesium_ion_token") == "***"
        assert "secret-token-value" not in str(details)

    def test_audit_log_server_side_sort(self, seeded_admin_client):
        """audit log supports server-side sorting."""
        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            "/api/v1/admin/audit-log?sort_by=action&sort_dir=asc",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        if len(data) >= 2:
            actions = [e["action"] for e in data]
            assert actions == sorted(actions)


class TestAdminAirports:
    """test admin airport overview endpoints."""

    def test_list_airports_admin(self, seeded_admin_client):
        """admin can list airports with counts."""
        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            "/api/v1/admin/airports",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert "data" in resp.json()

    def test_drone_count_is_per_airport(self, seeded_admin_client, admin_session_factory):
        """drone_count reflects distinct drones used at each airport, not global total."""
        from app.models.mission import DroneProfile, Mission

        db = admin_session_factory()
        try:
            airport_a = Airport(
                icao_code="AAAA",
                name="Airport A",
                elevation=50.0,
                location="SRID=4326;POINTZ(10.0 40.0 50)",
            )
            airport_b = Airport(
                icao_code="BBBB",
                name="Airport B",
                elevation=60.0,
                location="SRID=4326;POINTZ(11.0 41.0 60)",
            )
            drone1 = DroneProfile(name="Drone 1")
            drone2 = DroneProfile(name="Drone 2")
            db.add_all([airport_a, airport_b, drone1, drone2])
            db.flush()

            # airport A gets two missions with different drones
            db.add(Mission(name="M1", airport_id=airport_a.id, drone_profile_id=drone1.id))
            db.add(Mission(name="M2", airport_id=airport_a.id, drone_profile_id=drone2.id))
            # airport B gets one mission with one drone
            db.add(Mission(name="M3", airport_id=airport_b.id, drone_profile_id=drone1.id))
            db.commit()
        finally:
            db.close()

        token = _get_admin_token(seeded_admin_client)
        resp = seeded_admin_client.get(
            "/api/v1/admin/airports",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        airports = {a["icao_code"]: a for a in resp.json()["data"]}
        assert airports["AAAA"]["drone_count"] == 2
        assert airports["BBBB"]["drone_count"] == 1
