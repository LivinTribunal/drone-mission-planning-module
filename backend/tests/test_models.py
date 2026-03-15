from sqlalchemy import inspect

import app.models  # noqa: F401
from app.core.database import Base

# Test Data
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

AIRPORT_PAYLOAD = {
    "icao_code": "LZIB",
    "name": "Bratislava Airport",
    "elevation": 133.0,
    "location": "SRID=4326;POINTZ(17.2127 48.1702 133)",
}

MISSION_PAYLOAD = {
    "name": "Test Mission",
}


# Tests
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
    """test airport CRUD operations"""
    from app.models.airport import Airport

    airport = Airport(**AIRPORT_PAYLOAD)
    db_session.add(airport)
    db_session.flush()

    result = db_session.query(Airport).filter_by(icao_code="LZIB").first()
    assert result is not None
    assert result.name == "Bratislava Airport"


def test_mission_default_status(db_session):
    """test mission default status"""
    from app.models.airport import Airport
    from app.models.mission import Mission

    airport = db_session.query(Airport).filter_by(icao_code="LZIB").first()
    if not airport:
        airport = Airport(**AIRPORT_PAYLOAD)
        db_session.add(airport)
        db_session.flush()

    mission = Mission(name="Test Mission", airport_id=airport.id)
    db_session.add(mission)
    db_session.flush()

    result = db_session.query(Mission).filter_by(name="Test Mission").first()

    assert result is not None
    assert result.status == "DRAFT"
