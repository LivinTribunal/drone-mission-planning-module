from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError
from app.models.agl import AGL
from app.models.inspection import (
    InspectionConfiguration,
    InspectionTemplate,
    insp_template_methods,
)
from app.schemas.inspection_template import InspectionTemplateCreate, InspectionTemplateUpdate
from app.services.geometry_converter import apply_dict_update


def _enrich(template: InspectionTemplate, db: Session) -> InspectionTemplate:
    """attach computed fields so pydantic can serialize them"""
    methods_rows = db.execute(
        select(insp_template_methods.c.method).where(
            insp_template_methods.c.template_id == template.id
        )
    ).fetchall()

    template.methods = [row[0] for row in methods_rows]
    template.target_agl_ids = [agl.id for agl in template.targets]

    return template


def _load_template(db: Session, template_id: UUID) -> InspectionTemplate:
    """load template with eager-loaded relations"""
    template = (
        db.query(InspectionTemplate)
        .options(
            joinedload(InspectionTemplate.default_config),
            joinedload(InspectionTemplate.targets),
        )
        .filter(InspectionTemplate.id == template_id)
        .first()
    )
    if not template:
        raise NotFoundError("template not found")

    return _enrich(template, db)


def list_templates(db: Session, airport_id: UUID | None = None) -> list[InspectionTemplate]:
    """list all inspection templates"""
    query = db.query(InspectionTemplate).options(
        joinedload(InspectionTemplate.default_config),
        joinedload(InspectionTemplate.targets),
    )

    if airport_id:
        query = query.filter(InspectionTemplate.targets.any(AGL.surface.has(airport_id=airport_id)))

    templates = query.all()

    return [_enrich(template, db) for template in templates]


def get_template(db: Session, template_id: UUID) -> InspectionTemplate:
    """get template by id"""
    return _load_template(db, template_id)


def create_template(db: Session, schema: InspectionTemplateCreate) -> InspectionTemplate:
    """create inspection template"""
    data = schema.model_dump()
    config_data = data.pop("default_config", None)
    target_ids = data.pop("target_agl_ids", [])
    methods = data.pop("methods", [])

    config = None
    if config_data:
        config = InspectionConfiguration(**config_data)
        db.add(config)
        db.flush()

    template = InspectionTemplate(**data)
    if config:
        template.default_config_id = config.id

    if target_ids:
        agls = db.query(AGL).filter(AGL.id.in_(target_ids)).all()
        template.targets = agls

    db.add(template)
    db.flush()

    for method in methods:
        db.execute(insp_template_methods.insert().values(template_id=template.id, method=method))

    db.commit()

    return _load_template(db, template.id)


def update_template(
    db: Session, template_id: UUID, schema: InspectionTemplateUpdate
) -> InspectionTemplate:
    """update inspection template"""
    template = (
        db.query(InspectionTemplate)
        .options(joinedload(InspectionTemplate.targets))
        .filter(InspectionTemplate.id == template_id)
        .first()
    )
    if not template:
        raise NotFoundError("template not found")

    data = schema.model_dump(exclude_unset=True)
    target_ids = data.pop("target_agl_ids", None)
    methods = data.pop("methods", None)

    apply_dict_update(template, data)

    if target_ids is not None:
        agls = db.query(AGL).filter(AGL.id.in_(target_ids)).all()
        template.targets = agls

    if methods is not None:
        db.execute(
            insp_template_methods.delete().where(insp_template_methods.c.template_id == template_id)
        )
        for method in methods:
            db.execute(
                insp_template_methods.insert().values(template_id=template_id, method=method)
            )

    db.commit()

    return _load_template(db, template_id)


def delete_template(db: Session, template_id: UUID):
    """delete inspection template"""
    template = (
        db.query(InspectionTemplate)
        .options(joinedload(InspectionTemplate.default_config))
        .filter(InspectionTemplate.id == template_id)
        .first()
    )
    if not template:
        raise NotFoundError("template not found")

    config = template.default_config
    db.delete(template)

    if config:
        db.delete(config)

    db.commit()
