from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from testcontainers.postgres import PostgresContainer

import app.models  # noqa: F401
from app.api.dependencies import get_current_user
from app.core.database import Base, get_db
from app.main import app

# stub user for auth bypass in existing tests
_test_user = SimpleNamespace(
    id="00000000-0000-0000-0000-000000000099",
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
