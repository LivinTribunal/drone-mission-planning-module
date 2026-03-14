from sqlalchemy import inspect

import app.models  # noqa: F401
from app.core.database import Base

EXPECTED_TABLES = {
    "airport",
    "airfield_surface",
    "obstacle",
    "safety_zone",
    "agl",
    "lha",
    "drone_profile",
    "inspection_template",
    "insp_template_targets",
    "insp_template_methods",
    "inspection_configuration",
    "mission",
    "inspection",
    "flight_plan",
    "waypoint",
    "validation_result",
    "validation_violation",
    "export_result",
    "constraint_rule",
}


def test_all_19_tables_registered():
    """all 19 tables exist in metadata"""
    table_names = set(Base.metadata.tables.keys())
    assert EXPECTED_TABLES.issubset(table_names), f"missing: {EXPECTED_TABLES - table_names}"


def test_all_tables_created_in_database(db_engine):
    """tables are actually created in a real postgis database"""
    inspector = inspect(db_engine)
    db_tables = set(inspector.get_table_names())
    assert EXPECTED_TABLES.issubset(db_tables), f"missing: {EXPECTED_TABLES - db_tables}"


def test_airport_crud(db_session):
    from app.models.airport import Airport

    airport = Airport(
        icao_code="LZIB",
        name="Bratislava Airport",
        elevation=133.0,
        location="SRID=4326;POINTZ(17.2127 48.1702 133)",
    )
    db_session.add(airport)
    db_session.flush()

    result = db_session.query(Airport).filter_by(icao_code="LZIB").first()
    assert result is not None
    assert result.name == "Bratislava Airport"


def test_mission_default_status(db_session):
    from app.models.mission import Mission

    mission = Mission(name="Test Mission")
    db_session.add(mission)
    db_session.flush()

    result = db_session.query(Mission).filter_by(name="Test Mission").first()
    assert result is not None
    assert result.status == "DRAFT"
