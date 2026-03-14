import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from testcontainers.postgres import PostgresContainer

import app.models  # noqa: F401
from app.core.database import Base


# test db config
@pytest.fixture(scope="session")
def db_engine():
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


# test db session
@pytest.fixture
def db_session(db_engine):
    session = sessionmaker(bind=db_engine)()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
