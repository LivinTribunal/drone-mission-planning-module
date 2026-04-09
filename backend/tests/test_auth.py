from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from testcontainers.postgres import PostgresContainer

import app.models  # noqa: F401
from app.api.dependencies import get_current_user
from app.core.database import Base, get_db
from app.main import app
from app.models.user import User
from app.services.auth_service import (
    build_user_response,
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_token,
)


@pytest.fixture(scope="module")
def auth_db_engine():
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
def auth_client(auth_db_engine):
    """test client without auth override - tests real jwt flow."""
    TestSession = sessionmaker(bind=auth_db_engine)

    # save all overrides so we can restore them exactly
    saved_overrides = dict(app.dependency_overrides)

    def override_get_db():
        """yield a test session."""
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    # override db but remove auth override to test real jwt
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides.pop(get_current_user, None)
    yield TestClient(app)

    # restore all previous overrides
    app.dependency_overrides.clear()
    app.dependency_overrides.update(saved_overrides)


@pytest.fixture(scope="module")
def auth_db_session(auth_db_engine):
    """module-scoped session for seeding auth test data."""
    session = sessionmaker(bind=auth_db_engine)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="module", autouse=True)
def seed_test_user(auth_db_session):
    """create test users for auth tests."""
    user = User(
        id=uuid4(),
        email="testauth@tarmacview.com",
        hashed_password=hash_password("testpass123"),
        name="Auth Test User",
        role="OPERATOR",
        is_active=True,
    )
    auth_db_session.add(user)

    # inactive user for testing deactivated login
    inactive_user = User(
        id=uuid4(),
        email="inactive@tarmacview.com",
        hashed_password=hash_password("testpass123"),
        name="Inactive User",
        role="OPERATOR",
        is_active=False,
    )
    auth_db_session.add(inactive_user)
    auth_db_session.commit()
    return user


# password hashing
class TestPasswordHashing:
    """password hashing and verification."""

    def test_hash_and_verify(self):
        """hashed password should verify correctly."""
        hashed = hash_password("secret123")
        assert verify_password("secret123", hashed)
        assert not verify_password("wrong", hashed)

    def test_different_hashes(self):
        """same password should produce different hashes (salt)."""
        h1 = hash_password("secret123")
        h2 = hash_password("secret123")
        assert h1 != h2


# token creation and verification
class TestTokens:
    """jwt token creation and verification."""

    def test_access_token_roundtrip(self):
        """access token should encode and decode correctly."""
        uid = uuid4()
        token = create_access_token(uid, "OPERATOR")
        payload = verify_token(token)
        assert payload is not None
        assert payload["sub"] == str(uid)
        assert payload["role"] == "OPERATOR"
        assert payload["type"] == "access"

    def test_refresh_token_roundtrip(self):
        """refresh token should encode and decode correctly."""
        uid = uuid4()
        token = create_refresh_token(uid)
        payload = verify_token(token)
        assert payload is not None
        assert payload["sub"] == str(uid)
        assert payload["type"] == "refresh"

    def test_invalid_token_returns_none(self):
        """invalid token should return none."""
        assert verify_token("garbage.token.here") is None


# build_user_response
class TestBuildUserResponse:
    """auth_service.build_user_response tests."""

    def test_builds_response_from_orm(self, seed_test_user):
        """build_user_response converts orm user to schema."""
        resp = build_user_response(seed_test_user)
        assert resp.id == seed_test_user.id
        assert resp.email == seed_test_user.email
        assert resp.name == seed_test_user.name
        assert resp.role == seed_test_user.role
        assert resp.is_active is True


# auth endpoints
class TestLoginEndpoint:
    """POST /api/v1/auth/login tests."""

    def test_login_success(self, auth_client):
        """valid credentials return tokens and user."""
        resp = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "testauth@tarmacview.com", "password": "testpass123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == "testauth@tarmacview.com"
        assert data["user"]["role"] == "OPERATOR"

    def test_login_wrong_password(self, auth_client):
        """wrong password returns 401."""
        resp = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "testauth@tarmacview.com", "password": "wrong"},
        )
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, auth_client):
        """nonexistent user returns 401."""
        resp = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@tarmacview.com", "password": "pass"},
        )
        assert resp.status_code == 401


class TestInactiveUser:
    """inactive user login tests."""

    def test_inactive_user_login_rejected(self, auth_client):
        """inactive user should get 401 on login."""
        resp = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "inactive@tarmacview.com", "password": "testpass123"},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "invalid credentials"


class TestRefreshEndpoint:
    """POST /api/v1/auth/refresh tests."""

    def test_refresh_success(self, auth_client):
        """valid refresh token returns new access token."""
        login = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "testauth@tarmacview.com", "password": "testpass123"},
        )
        refresh_token = login.json()["refresh_token"]

        resp = auth_client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

        # rotated refresh token is a valid jwt
        rotated_payload = verify_token(data["refresh_token"])
        assert rotated_payload is not None
        assert rotated_payload["type"] == "refresh"

    def test_refresh_with_access_token_fails(self, auth_client):
        """access token should not work as refresh token."""
        login = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "testauth@tarmacview.com", "password": "testpass123"},
        )
        access_token = login.json()["access_token"]

        resp = auth_client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": access_token},
        )
        assert resp.status_code == 401

    def test_refresh_invalid_token(self, auth_client):
        """invalid refresh token returns 401."""
        resp = auth_client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "garbage"},
        )
        assert resp.status_code == 401


class TestMeEndpoint:
    """GET /api/v1/auth/me tests."""

    def test_me_authenticated(self, auth_client):
        """authenticated user can get their info."""
        login = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "testauth@tarmacview.com", "password": "testpass123"},
        )
        token = login.json()["access_token"]

        resp = auth_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == "testauth@tarmacview.com"

    def test_me_unauthenticated(self, auth_client):
        """unauthenticated request returns 401."""
        resp = auth_client.get("/api/v1/auth/me")
        assert resp.status_code == 401


class TestUpdateMe:
    """PUT /api/v1/auth/me tests."""

    def test_update_name(self, auth_client):
        """user can update their name."""
        login = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "testauth@tarmacview.com", "password": "testpass123"},
        )
        token = login.json()["access_token"]

        resp = auth_client.put(
            "/api/v1/auth/me",
            json={"name": "Updated Name"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    def test_update_password(self, auth_client):
        """user can update password and login with it."""
        login = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "testauth@tarmacview.com", "password": "testpass123"},
        )
        token = login.json()["access_token"]

        resp = auth_client.put(
            "/api/v1/auth/me",
            json={"password": "newpass456!"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

        # login with new password succeeds
        login2 = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "testauth@tarmacview.com", "password": "newpass456!"},
        )
        assert login2.status_code == 200

        # old password no longer works
        login3 = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "testauth@tarmacview.com", "password": "testpass123"},
        )
        assert login3.status_code == 401

        # restore original password for other tests
        token2 = login2.json()["access_token"]
        auth_client.put(
            "/api/v1/auth/me",
            json={"password": "testpass123"},
            headers={"Authorization": f"Bearer {token2}"},
        )

    def test_update_empty_name_rejected(self, auth_client):
        """empty name should be rejected."""
        login = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "testauth@tarmacview.com", "password": "testpass123"},
        )
        token = login.json()["access_token"]

        resp = auth_client.put(
            "/api/v1/auth/me",
            json={"name": ""},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422

    def test_update_short_password_rejected(self, auth_client):
        """password under 8 chars should be rejected."""
        login = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "testauth@tarmacview.com", "password": "testpass123"},
        )
        token = login.json()["access_token"]

        resp = auth_client.put(
            "/api/v1/auth/me",
            json={"password": "short"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422


class TestMalformedTokenPayload:
    """test that non-uuid sub claims return 401, not 500."""

    def test_non_uuid_sub_in_access_token_returns_401(self, auth_client):
        """jwt with non-uuid sub should return 401 on protected endpoints."""
        from jose import jwt as josejwt

        from app.core.config import settings

        token = josejwt.encode(
            {"sub": "not-a-uuid", "role": "OPERATOR", "type": "access", "exp": 9999999999},
            settings.jwt_secret,
            algorithm="HS256",
        )
        resp = auth_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "invalid token payload"

    def test_non_uuid_sub_in_refresh_token_returns_401(self, auth_client):
        """jwt with non-uuid sub should return 401 on /refresh."""
        from jose import jwt as josejwt

        from app.core.config import settings

        token = josejwt.encode(
            {"sub": "not-a-uuid", "type": "refresh", "exp": 9999999999},
            settings.jwt_secret,
            algorithm="HS256",
        )
        resp = auth_client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": token},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "invalid or expired refresh token"

    def test_missing_sub_in_access_token_returns_401(self, auth_client):
        """jwt without sub claim should return 401."""
        from jose import jwt as josejwt

        from app.core.config import settings

        token = josejwt.encode(
            {"role": "OPERATOR", "type": "access", "exp": 9999999999},
            settings.jwt_secret,
            algorithm="HS256",
        )
        resp = auth_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "invalid token payload"

    def test_missing_sub_in_refresh_token_returns_401(self, auth_client):
        """jwt without sub claim should return 401 on /refresh."""
        from jose import jwt as josejwt

        from app.core.config import settings

        token = josejwt.encode(
            {"type": "refresh", "exp": 9999999999},
            settings.jwt_secret,
            algorithm="HS256",
        )
        resp = auth_client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": token},
        )
        assert resp.status_code == 401


class TestProtectedEndpoints:
    """verify that protected endpoints reject unauthenticated requests."""

    def test_airports_requires_auth(self, auth_client):
        """airports list should return 401 without token."""
        resp = auth_client.get("/api/v1/airports")
        assert resp.status_code == 401

    def test_missions_requires_auth(self, auth_client):
        """missions list should return 401 without token."""
        resp = auth_client.get("/api/v1/missions")
        assert resp.status_code == 401

    def test_drone_profiles_requires_auth(self, auth_client):
        """drone profiles list should return 401 without token."""
        resp = auth_client.get("/api/v1/drone-profiles")
        assert resp.status_code == 401

    def test_templates_requires_auth(self, auth_client):
        """templates list should return 401 without token."""
        resp = auth_client.get("/api/v1/inspection-templates")
        assert resp.status_code == 401


class TestRoleAccess:
    """verify role-based access control."""

    def test_operator_cannot_create_airport(self, auth_client):
        """operator role should be rejected for coordinator-level endpoints."""
        login = auth_client.post(
            "/api/v1/auth/login",
            json={"email": "testauth@tarmacview.com", "password": "testpass123"},
        )
        token = login.json()["access_token"]

        resp = auth_client.post(
            "/api/v1/airports",
            json={
                "icao_code": "TEST",
                "name": "Test Airport",
                "elevation": 100.0,
                "location": {"type": "Point", "coordinates": [0, 0, 100]},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# verify_password edge cases
class TestVerifyPasswordEdgeCases:
    """verify_password handles corrupted hashes gracefully."""

    def test_empty_hash_returns_false(self):
        """empty hash string should return false, not raise."""
        assert not verify_password("password", "")

    def test_garbage_hash_returns_false(self):
        """non-bcrypt string should return false, not raise."""
        assert not verify_password("password", "not-a-bcrypt-hash")

    def test_none_like_hash_returns_false(self):
        """truncated bcrypt prefix should return false."""
        assert not verify_password("password", "$2b$")


# expired token
class TestExpiredToken:
    """expired tokens should be rejected."""

    def test_expired_access_token_returns_401(self, auth_client):
        """access token with exp in the past should return 401."""
        from datetime import datetime, timedelta, timezone

        from jose import jwt as josejwt

        from app.core.config import settings

        expired_payload = {
            "sub": str(uuid4()),
            "role": "OPERATOR",
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=10),
        }
        token = josejwt.encode(expired_payload, settings.jwt_secret, algorithm="HS256")
        resp = auth_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401

    def test_expired_refresh_token_returns_401(self, auth_client):
        """refresh token with exp in the past should return 401."""
        from datetime import datetime, timedelta, timezone

        from jose import jwt as josejwt

        from app.core.config import settings

        expired_payload = {
            "sub": str(uuid4()),
            "type": "refresh",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=10),
        }
        token = josejwt.encode(expired_payload, settings.jwt_secret, algorithm="HS256")
        resp = auth_client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": token},
        )
        assert resp.status_code == 401
