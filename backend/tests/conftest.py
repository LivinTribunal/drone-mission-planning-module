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
