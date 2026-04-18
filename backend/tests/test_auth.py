"""tests for jwt authentication and role-based access control."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from testcontainers.postgres import PostgresContainer

import app.models  # noqa: F401
from app.core.database import Base, get_db
from app.main import app
from app.models.airport import Airport
from app.models.enums import MissionStatus, UserRole
from app.models.mission import Mission
from app.models.user import User
from app.services import auth_service


@pytest.fixture(scope="module")
def auth_engine():
    """dedicated postgis database for auth tests."""
    with PostgresContainer(
        image="postgis/postgis:16-3.4",
        username="test",
        password="test",
        dbname="test_auth",
    ) as pg:
        engine = create_engine(pg.get_connection_url())
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            conn.commit()

        Base.metadata.create_all(engine)
        yield engine
        Base.metadata.drop_all(engine)


@pytest.fixture(scope="module")
def auth_session_factory(auth_engine):
    """session factory for auth tests."""
    return sessionmaker(bind=auth_engine)


@pytest.fixture
def auth_db(auth_session_factory):
    """per-test session with rollback."""
    session = auth_session_factory()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture(scope="module")
def auth_client(auth_engine, auth_session_factory):
    """test client without auth override - real auth flow."""

    def override_get_db():
        """test db override."""
        db = auth_session_factory()
        try:
            yield db
        finally:
            db.close()

    # save existing overrides so other test modules aren't affected
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    app.dependency_overrides.update(saved_overrides)


@pytest.fixture(scope="module")
def seeded_auth_client(auth_client, auth_session_factory):
    """auth client with seed users created."""
    db = auth_session_factory()
    try:
        auth_service.seed_users(db)
    finally:
        db.close()

    return auth_client


# user model tests


class TestUserModel:
    """test user model domain methods."""

    def test_set_and_verify_password(self):
        """password hashing and verification."""
        user = User(email="t@t.com", name="t", role=UserRole.OPERATOR.value)
        user.set_password("secret123")
        assert user.hashed_password is not None
        assert user.verify_password("secret123")
        assert not user.verify_password("wrong")

    def test_verify_password_no_hash(self):
        """verify returns false when no hash set."""
        user = User(email="t@t.com", name="t", role=UserRole.OPERATOR.value)
        assert not user.verify_password("anything")

    def test_has_airport_access_super_admin(self):
        """super admin bypasses airport check."""
        user = User(email="a@a.com", name="a", role=UserRole.SUPER_ADMIN.value)
        user.airports = []
        assert user.has_airport_access("any-id")

    def test_has_airport_access_operator(self):
        """operator needs explicit assignment."""
        user = User(email="o@o.com", name="o", role=UserRole.OPERATOR.value)
        user.airports = []
        assert not user.has_airport_access("some-id")


# auth service tests


class TestAuthService:
    """test auth service token creation and validation."""

    def test_create_and_decode_access_token(self):
        """access token roundtrip."""
        token = auth_service.create_access_token("user-123", "OPERATOR")
        payload = auth_service.decode_token(token)
        assert payload["sub"] == "user-123"
        assert payload["role"] == "OPERATOR"
        assert payload["type"] == "access"

    def test_create_and_decode_refresh_token(self):
        """refresh token roundtrip."""
        token = auth_service.create_refresh_token("user-456")
        payload = auth_service.decode_token(token)
        assert payload["sub"] == "user-456"
        assert payload["type"] == "refresh"

    def test_decode_invalid_token(self):
        """invalid token raises domain error."""
        from app.core.exceptions import DomainError

        with pytest.raises(DomainError, match="invalid or expired token"):
            auth_service.decode_token("not-a-real-token")

    def test_seed_users(self, auth_db):
        """seed creates users when none exist."""
        auth_service.seed_users(auth_db)
        count = auth_db.query(User).count()
        assert count >= 3

    def test_seed_users_idempotent(self, auth_db):
        """seed skips when users already exist."""
        auth_service.seed_users(auth_db)
        count_before = auth_db.query(User).count()
        auth_service.seed_users(auth_db)
        count_after = auth_db.query(User).count()
        assert count_before == count_after

    def test_authenticate_valid(self, auth_db):
        """valid credentials return user."""
        auth_service.seed_users(auth_db)
        user = auth_service.authenticate_user(auth_db, "admin@tmv.com", "adminadmin")
        assert user is not None
        assert user.role == UserRole.SUPER_ADMIN.value

    def test_authenticate_wrong_password(self, auth_db):
        """wrong password returns none."""
        auth_service.seed_users(auth_db)
        user = auth_service.authenticate_user(auth_db, "admin@tmv.com", "wrong")
        assert user is None

    def test_authenticate_nonexistent(self, auth_db):
        """nonexistent email returns none."""
        user = auth_service.authenticate_user(auth_db, "nobody@tarmacview.com", "pass")
        assert user is None


# auth endpoint tests


class TestAuthEndpoints:
    """test auth api endpoints."""

    def test_login_success(self, seeded_auth_client):
        """valid login returns tokens and user."""
        resp = seeded_auth_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@tmv.com", "password": "adminadmin"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["role"] == "SUPER_ADMIN"

    def test_login_wrong_password(self, seeded_auth_client):
        """invalid credentials return 401."""
        resp = seeded_auth_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@tmv.com", "password": "wrong"},
        )
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, seeded_auth_client):
        """nonexistent user returns 401."""
        resp = seeded_auth_client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@test.com", "password": "test"},
        )
        assert resp.status_code == 401

    def test_refresh_token(self, seeded_auth_client):
        """refresh endpoint returns new access token."""
        login = seeded_auth_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@tmv.com", "password": "adminadmin"},
        )
        refresh_token = login.json()["refresh_token"]

        resp = seeded_auth_client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_refresh_invalid_token(self, seeded_auth_client):
        """invalid refresh token returns 401."""
        resp = seeded_auth_client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "invalid"},
        )
        assert resp.status_code == 401

    def test_get_me(self, seeded_auth_client):
        """authenticated user can get own profile."""
        login = seeded_auth_client.post(
            "/api/v1/auth/login",
            json={"email": "operator@tmv.com", "password": "operator"},
        )
        token = login.json()["access_token"]

        resp = seeded_auth_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "operator@tmv.com"
        assert data["role"] == "OPERATOR"

    def test_get_me_no_token(self, seeded_auth_client):
        """unauthenticated request returns 401."""
        resp = seeded_auth_client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_update_me(self, seeded_auth_client):
        """user can update own name."""
        login = seeded_auth_client.post(
            "/api/v1/auth/login",
            json={"email": "operator@tmv.com", "password": "operator"},
        )
        token = login.json()["access_token"]

        resp = seeded_auth_client.put(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "Updated Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    def test_setup_password_too_short(self, seeded_auth_client):
        """setup-password rejects passwords shorter than 8 chars."""
        resp = seeded_auth_client.post(
            "/api/v1/auth/setup-password",
            json={"token": "fake-token", "password": "short"},
        )
        assert resp.status_code == 422

    def test_reset_password_too_short(self, seeded_auth_client):
        """reset-password rejects passwords shorter than 8 chars."""
        resp = seeded_auth_client.post(
            "/api/v1/auth/reset-password",
            json={"token": "fake-token", "new_password": "short"},
        )
        assert resp.status_code == 422

    def test_update_me_password_too_short(self, seeded_auth_client):
        """update-me rejects passwords shorter than 8 chars."""
        login = seeded_auth_client.post(
            "/api/v1/auth/login",
            json={"email": "operator@tmv.com", "password": "operator"},
        )
        token = login.json()["access_token"]

        resp = seeded_auth_client.put(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            json={"password": "short", "current_password": "operator"},
        )
        assert resp.status_code == 422


# role-based access control tests


class TestRBAC:
    """test role-based access enforcement."""

    def _get_token(self, client, email, password):
        """helper to get access token."""
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        return resp.json()["access_token"]

    def test_operator_cannot_create_drone(self, seeded_auth_client):
        """operator role is blocked from coordinator endpoints."""
        token = self._get_token(seeded_auth_client, "operator@tmv.com", "operator")
        resp = seeded_auth_client.post(
            "/api/v1/drone-profiles",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "Test Drone"},
        )
        assert resp.status_code == 403

    def test_coordinator_can_create_drone(self, seeded_auth_client):
        """coordinator role can access coordinator endpoints."""
        token = self._get_token(seeded_auth_client, "coord@tmv.com", "coordinator")
        resp = seeded_auth_client.post(
            "/api/v1/drone-profiles",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "Test Drone RBAC"},
        )
        assert resp.status_code == 201

    def test_unauthenticated_blocked(self, seeded_auth_client):
        """unauthenticated requests are blocked on protected routes."""
        resp = seeded_auth_client.get("/api/v1/airports")
        assert resp.status_code == 401

    def test_health_is_public(self, seeded_auth_client):
        """health endpoint needs no auth."""
        resp = seeded_auth_client.get("/api/v1/health")
        assert resp.status_code == 200

    def test_operator_cannot_access_other_airport_sub_resources(
        self, seeded_auth_client, auth_session_factory
    ):
        """operator assigned to airport A cannot read surfaces of airport B."""
        db = auth_session_factory()
        try:
            airport_a = Airport(
                icao_code="AAAA",
                name="Airport A",
                elevation=100.0,
                location="SRID=4326;POINTZ(17.0 48.0 100)",
            )
            airport_b = Airport(
                icao_code="BBBB",
                name="Airport B",
                elevation=200.0,
                location="SRID=4326;POINTZ(18.0 49.0 200)",
            )
            db.add_all([airport_a, airport_b])
            db.flush()

            user = User(
                email="scoped-op@tarmacview.com",
                name="Scoped Op",
                role=UserRole.OPERATOR.value,
                is_active=True,
            )
            user.set_password("scoped123")
            user.airports = [airport_a]
            db.add(user)
            db.commit()

            airport_b_id = str(airport_b.id)
        finally:
            db.close()

        token = self._get_token(seeded_auth_client, "scoped-op@tarmacview.com", "scoped123")
        headers = {"Authorization": f"Bearer {token}"}

        # sub-resource endpoints should return 403 for airport B
        resp = seeded_auth_client.get(f"/api/v1/airports/{airport_b_id}/surfaces", headers=headers)
        assert resp.status_code == 403

        resp = seeded_auth_client.get(f"/api/v1/airports/{airport_b_id}/obstacles", headers=headers)
        assert resp.status_code == 403

        resp = seeded_auth_client.get(
            f"/api/v1/airports/{airport_b_id}/safety-zones", headers=headers
        )
        assert resp.status_code == 403

    def test_operator_cannot_access_mission_at_other_airport(
        self, seeded_auth_client, auth_session_factory
    ):
        """operator assigned to airport A cannot access missions at airport B."""
        db = auth_session_factory()
        try:
            airport_c = Airport(
                icao_code="CCCC",
                name="Airport C",
                elevation=100.0,
                location="SRID=4326;POINTZ(17.0 48.0 100)",
            )
            airport_d = Airport(
                icao_code="DDDD",
                name="Airport D",
                elevation=200.0,
                location="SRID=4326;POINTZ(18.0 49.0 200)",
            )
            db.add_all([airport_c, airport_d])
            db.flush()

            mission_at_d = Mission(
                name="Mission at D",
                airport_id=airport_d.id,
                status=MissionStatus.DRAFT,
            )
            db.add(mission_at_d)
            db.flush()

            user = User(
                email="mission-scoped@tarmacview.com",
                name="Mission Scoped",
                role=UserRole.OPERATOR.value,
                is_active=True,
            )
            user.set_password("scoped123")
            user.airports = [airport_c]
            db.add(user)
            db.commit()

            mission_id = str(mission_at_d.id)
        finally:
            db.close()

        token = self._get_token(seeded_auth_client, "mission-scoped@tarmacview.com", "scoped123")
        headers = {"Authorization": f"Bearer {token}"}

        # single-resource mission endpoints should return 403
        resp = seeded_auth_client.get(f"/api/v1/missions/{mission_id}", headers=headers)
        assert resp.status_code == 403

        resp = seeded_auth_client.put(
            f"/api/v1/missions/{mission_id}",
            headers=headers,
            json={"name": "hacked"},
        )
        assert resp.status_code == 403

        resp = seeded_auth_client.delete(f"/api/v1/missions/{mission_id}", headers=headers)
        assert resp.status_code == 403

        resp = seeded_auth_client.get(f"/api/v1/missions/{mission_id}/flight-plan", headers=headers)
        assert resp.status_code == 403

    def test_operator_list_missions_filtered_by_airport(
        self, seeded_auth_client, auth_session_factory
    ):
        """operator list_missions only returns missions at assigned airports."""
        db = auth_session_factory()
        try:
            airport_e = Airport(
                icao_code="EEEE",
                name="Airport E",
                elevation=100.0,
                location="SRID=4326;POINTZ(17.0 48.0 100)",
            )
            airport_f = Airport(
                icao_code="FFFF",
                name="Airport F",
                elevation=200.0,
                location="SRID=4326;POINTZ(18.0 49.0 200)",
            )
            db.add_all([airport_e, airport_f])
            db.flush()

            mission_e = Mission(
                name="Mission E",
                airport_id=airport_e.id,
                status=MissionStatus.DRAFT,
            )
            mission_f = Mission(
                name="Mission F",
                airport_id=airport_f.id,
                status=MissionStatus.DRAFT,
            )
            db.add_all([mission_e, mission_f])
            db.flush()

            user = User(
                email="list-filter@tarmacview.com",
                name="List Filter",
                role=UserRole.OPERATOR.value,
                is_active=True,
            )
            user.set_password("filter123")
            user.airports = [airport_e]
            db.add(user)
            db.commit()

            mission_e_id = str(mission_e.id)
            mission_f_id = str(mission_f.id)
        finally:
            db.close()

        token = self._get_token(seeded_auth_client, "list-filter@tarmacview.com", "filter123")
        headers = {"Authorization": f"Bearer {token}"}

        resp = seeded_auth_client.get("/api/v1/missions", headers=headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        ids = [m["id"] for m in data]
        assert mission_e_id in ids
        assert mission_f_id not in ids
