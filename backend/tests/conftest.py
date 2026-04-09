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

# mock user for test auth bypass
_test_user = User(
    id=uuid4(),
    email="test@tarmacview.com",
    hashed_password="unused",
    name="Test User",
    role="SUPER_ADMIN",
    is_active=True,
)


def _override_current_user():
    """bypass jwt auth in tests - returns a super_admin user."""
    return _test_user


# operator user for role-boundary tests
_operator_user = User(
    id=uuid4(),
    email="operator-test@tarmacview.com",
    hashed_password="unused",
    name="Operator User",
    role="OPERATOR",
    is_active=True,
)


def _override_operator_user():
    """bypass jwt auth in tests - returns an operator user."""
    return _operator_user


# shared test database
@pytest.fixture(scope="session")
def db_engine():
    """shared postgis test database"""
    with PostgresContainer(
        image="postgis/postgis:16-3.4",
        username="test",
        password="test",
        dbname="test",
    ) as pg:
        engine = create_engine(pg.get_connection_url())
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            conn.commit()

        Base.metadata.create_all(engine)
        yield engine
        Base.metadata.drop_all(engine)


# shared test client
@pytest.fixture(scope="session")
def client(db_engine):
    """shared test client with db override"""
    TestSession = sessionmaker(bind=db_engine)

    def override_get_db():
        """yield a test session."""
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = _override_current_user
    yield TestClient(app)
    app.dependency_overrides.clear()
    app.dependency_overrides.update(saved_overrides)


# per-test db session with rollback
@pytest.fixture
def db_session(db_engine):
    """per-test db session"""
    session = sessionmaker(bind=db_engine)()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


# operator-scoped client for role-boundary tests
@pytest.fixture(scope="session")
def operator_client(db_engine):
    """test client with operator role - for testing 403 responses."""
    TestSession = sessionmaker(bind=db_engine)

    def override_get_db():
        """yield a test session."""
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = _override_operator_user
    yield TestClient(app)
    app.dependency_overrides.clear()
    app.dependency_overrides.update(saved_overrides)
