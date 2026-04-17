from uuid import uuid4

import pytest

from app.core.exceptions import ConflictError, NotFoundError
from app.schemas.inspection_template import InspectionTemplateCreate, InspectionTemplateUpdate
from app.services.inspection_template_service import (
    create_template,
    delete_template,
    get_template,
    list_templates,
    update_template,
)


def test_create_template_basic(db_session):
    """create a template with name and methods via service"""
    schema = InspectionTemplateCreate(
        name="Service Test Template",
        methods=["ANGULAR_SWEEP"],
    )
    result = create_template(db_session, schema)

    assert result.name == "Service Test Template"
    assert result.methods == ["ANGULAR_SWEEP"]
    assert result.id is not None


def test_create_template_with_config(db_session):
    """create a template with default config"""
    schema = InspectionTemplateCreate(
        name="Template With Config",
        methods=["VERTICAL_PROFILE"],
        default_config={
            "altitude_offset": 2.5,
            "measurement_density": 8,
        },
    )
    result = create_template(db_session, schema)

    assert result.name == "Template With Config"
    assert result.default_config is not None
    assert result.default_config.altitude_offset == 2.5
    assert result.default_config.measurement_density == 8


def test_get_template_found(db_session):
    """get template by id"""
    schema = InspectionTemplateCreate(name="Get Test", methods=[])
    created = create_template(db_session, schema)

    result = get_template(db_session, created.id)
    assert result.id == created.id
    assert result.name == "Get Test"


def test_get_template_not_found(db_session):
    """get non-existent template raises not found"""
    with pytest.raises(NotFoundError):
        get_template(db_session, uuid4())


def test_list_templates_returns_all(db_session):
    """list templates returns created templates"""
    create_template(db_session, InspectionTemplateCreate(name="List A", methods=[]))
    create_template(db_session, InspectionTemplateCreate(name="List B", methods=[]))

    results = list_templates(db_session)
    names = [t.name for t in results]
    assert "List A" in names
    assert "List B" in names


def test_update_template_name(db_session):
    """update template name"""
    created = create_template(
        db_session,
        InspectionTemplateCreate(name="Before Update", methods=["ANGULAR_SWEEP"]),
    )

    schema = InspectionTemplateUpdate(name="After Update")
    result = update_template(db_session, created.id, schema)

    assert result.name == "After Update"
    assert result.methods == ["ANGULAR_SWEEP"]


def test_update_template_methods(db_session):
    """update template methods"""
    created = create_template(
        db_session,
        InspectionTemplateCreate(name="Methods Test", methods=["ANGULAR_SWEEP"]),
    )

    schema = InspectionTemplateUpdate(methods=["ANGULAR_SWEEP", "VERTICAL_PROFILE"])
    result = update_template(db_session, created.id, schema)

    assert sorted(result.methods) == ["ANGULAR_SWEEP", "VERTICAL_PROFILE"]


def test_update_template_config(db_session):
    """update template default config"""
    created = create_template(
        db_session,
        InspectionTemplateCreate(
            name="Config Update",
            methods=[],
            default_config={"measurement_density": 6},
        ),
    )

    schema = InspectionTemplateUpdate(
        default_config={"measurement_density": 10, "altitude_offset": 1.5},
    )
    result = update_template(db_session, created.id, schema)

    assert result.default_config is not None
    assert result.default_config.measurement_density == 10
    assert result.default_config.altitude_offset == 1.5


def test_update_template_add_config(db_session):
    """add config to template that had none"""
    created = create_template(
        db_session,
        InspectionTemplateCreate(name="No Config", methods=[]),
    )

    schema = InspectionTemplateUpdate(
        default_config={"hover_duration": 5.0},
    )
    result = update_template(db_session, created.id, schema)

    assert result.default_config is not None
    assert result.default_config.hover_duration == 5.0


def test_update_template_not_found(db_session):
    """update non-existent template raises not found"""
    schema = InspectionTemplateUpdate(name="Nope")
    with pytest.raises(NotFoundError):
        update_template(db_session, uuid4(), schema)


def test_delete_template_success(db_session):
    """delete template removes it"""
    created = create_template(
        db_session,
        InspectionTemplateCreate(name="To Delete", methods=[]),
    )

    delete_template(db_session, created.id)

    with pytest.raises(NotFoundError):
        get_template(db_session, created.id)


def test_delete_template_with_config(db_session):
    """delete template also removes its config"""
    created = create_template(
        db_session,
        InspectionTemplateCreate(
            name="Delete With Config",
            methods=[],
            default_config={"measurement_density": 5},
        ),
    )
    config_id = created.default_config.id

    delete_template(db_session, created.id)

    # config should be cleaned up
    from app.models.inspection import InspectionConfiguration

    config = db_session.get(InspectionConfiguration, config_id)
    assert config is None


def test_delete_template_not_found(db_session):
    """delete non-existent template raises not found"""
    with pytest.raises(NotFoundError):
        delete_template(db_session, uuid4())


def test_delete_template_with_linked_inspection(db_session):
    """delete template used by an inspection raises conflict"""
    from app.models.airport import Airport
    from app.models.inspection import Inspection
    from app.models.mission import Mission

    created = create_template(
        db_session,
        InspectionTemplateCreate(name="Linked Template", methods=["ANGULAR_SWEEP"]),
    )

    airport = Airport(
        icao_code="LZTM",
        name="Test Airport",
        elevation=100.0,
        location="SRID=4326;POINTZ(17.0 48.0 100)",
    )
    db_session.add(airport)
    db_session.flush()

    mission = Mission(name="Test Mission", airport_id=airport.id)
    db_session.add(mission)
    db_session.flush()

    inspection = Inspection(
        mission_id=mission.id,
        template_id=created.id,
        method="ANGULAR_SWEEP",
        sequence_order=1,
    )
    db_session.add(inspection)
    db_session.flush()

    with pytest.raises(ConflictError):
        delete_template(db_session, created.id)


def test_create_template_with_lha_ids(db_session):
    """create template with lha_ids in config does not raise uuid serialization error"""
    lha_id_1 = uuid4()
    lha_id_2 = uuid4()

    schema = InspectionTemplateCreate(
        name="Template With LHA IDs",
        methods=["ANGULAR_SWEEP"],
        default_config={
            "lha_ids": [lha_id_1, lha_id_2],
            "altitude_offset": 1.0,
        },
    )
    result = create_template(db_session, schema)

    assert result.default_config is not None
    assert result.default_config.lha_ids == [str(lha_id_1), str(lha_id_2)]
    assert result.default_config.altitude_offset == 1.0


def test_mission_count_enrichment(db_session):
    """mission count reflects linked inspections"""
    from app.models.airport import Airport
    from app.models.inspection import Inspection
    from app.models.mission import Mission

    created = create_template(
        db_session,
        InspectionTemplateCreate(name="Count Template", methods=["ANGULAR_SWEEP"]),
    )

    assert created.mission_count == 0

    airport = Airport(
        icao_code="LZCN",
        name="Count Airport",
        elevation=100.0,
        location="SRID=4326;POINTZ(17.0 48.0 100)",
    )
    db_session.add(airport)
    db_session.flush()

    mission = Mission(name="Count Mission", airport_id=airport.id)
    db_session.add(mission)
    db_session.flush()

    inspection = Inspection(
        mission_id=mission.id,
        template_id=created.id,
        method="ANGULAR_SWEEP",
        sequence_order=1,
    )
    db_session.add(inspection)
    db_session.flush()

    result = get_template(db_session, created.id)
    assert result.mission_count == 1
