from types import SimpleNamespace
from uuid import UUID

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

TEST_USER_ID = UUID("00000000-0000-0000-0000-000000000099")
OPERATOR_USER_ID = UUID("00000000-0000-0000-0000-000000000088")

# stub user for auth bypass in existing tests
_test_user = SimpleNamespace(
    id=TEST_USER_ID,
    email="test@tarmacview.com",
    name="Test User",
    role="SUPER_ADMIN",
    is_active=True,
    airports=[],
)
_test_user.has_airport_access = lambda airport_id: True


def _override_current_user():
    """bypass auth for existing tests - returns super admin stub."""
    return _test_user


def _ensure_test_user_exists(engine):
    """insert the stub test user into the db so FK constraints pass."""
    session = sessionmaker(bind=engine)()
    try:
        existing = session.query(User).filter(User.id == TEST_USER_ID).first()
        if not existing:
            user = User(
                id=TEST_USER_ID,
                email="test@tarmacview.com",
                name="Test User",
                role="SUPER_ADMIN",
                is_active=True,
            )
            user.set_password("testpassword")
            session.add(user)
            session.commit()
    finally:
        session.close()


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
        _ensure_test_user_exists(engine)
        yield engine
        Base.metadata.drop_all(engine)


# shared test client
@pytest.fixture(scope="session")
def client(db_engine):
    """shared test client with db and auth overrides"""
    TestSession = sessionmaker(bind=db_engine)

    def override_get_db():
        """test db override."""
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = _override_current_user
    yield TestClient(app)
    app.dependency_overrides.clear()


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


@pytest.fixture
def as_operator(db_engine):
    """context-manager factory that swaps auth to a non-owner OPERATOR user.

    FastAPI's dependency_overrides is global, so a plain "operator_client"
    fixture would poison requests made through the default `client` fixture
    for the duration of the test. Using a context manager scopes the override
    strictly to the `with` block: setup/teardown through the super-admin
    `client`, and assertions on ownership through the scoped operator client.

    usage:
        def test_foo(client, as_operator):
            preset_id = client.post(...).json()["id"]
            with as_operator() as op_client:
                assert op_client.get(...).status_code == 404
    """
    from contextlib import contextmanager

    session = sessionmaker(bind=db_engine)()
    try:
        existing = session.query(User).filter(User.id == OPERATOR_USER_ID).first()
        if not existing:
            user = User(
                id=OPERATOR_USER_ID,
                email="operator@tarmacview.com",
                name="Operator B",
                role="OPERATOR",
                is_active=True,
            )
            user.set_password("testpassword")
            session.add(user)
            session.commit()
    finally:
        session.close()

    operator_stub = SimpleNamespace(
        id=OPERATOR_USER_ID,
        email="operator@tarmacview.com",
        name="Operator B",
        role="OPERATOR",
        is_active=True,
        airports=[],
    )
    operator_stub.has_airport_access = lambda airport_id: True

    TestSession = sessionmaker(bind=db_engine)

    def override_db():
        """test db override."""
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    @contextmanager
    def _as_operator():
        saved = dict(app.dependency_overrides)
        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: operator_stub
        try:
            yield TestClient(app)
        finally:
            app.dependency_overrides.clear()
            app.dependency_overrides.update(saved)

    return _as_operator
