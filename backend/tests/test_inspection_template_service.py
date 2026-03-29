from uuid import uuid4

import pytest

from app.core.exceptions import NotFoundError
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
            "speed_override": 4.0,
            "measurement_density": 8,
        },
    )
    result = create_template(db_session, schema)

    assert result.name == "Template With Config"
    assert result.default_config is not None
    assert result.default_config.altitude_offset == 2.5
    assert result.default_config.speed_override == 4.0
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
            default_config={"speed_override": 3.0},
        ),
    )

    schema = InspectionTemplateUpdate(
        default_config={"speed_override": 7.0, "altitude_offset": 1.5},
    )
    result = update_template(db_session, created.id, schema)

    assert result.default_config is not None
    assert result.default_config.speed_override == 7.0
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
            default_config={"speed_override": 2.0},
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
