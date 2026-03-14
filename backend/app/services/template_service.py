from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.agl import AGL
from app.models.inspection import (
    InspectionConfiguration,
    InspectionTemplate,
    insp_template_methods,
)


def _serialize(template: InspectionTemplate, db: Session) -> dict:
    # get methods from junction table
    methods_rows = db.execute(
        select(insp_template_methods.c.method).where(
            insp_template_methods.c.template_id == template.id
        )
    ).fetchall()
    methods = [r[0] for r in methods_rows]

    target_ids = [str(agl.id) for agl in template.targets]

    result = {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "angular_tolerances": template.angular_tolerances,
        "created_by": template.created_by,
        "created_at": str(template.created_at) if template.created_at else None,
        "default_config": None,
        "target_agl_ids": target_ids,
        "methods": methods,
    }

    if template.default_config:
        cfg = template.default_config
        result["default_config"] = {
            "id": cfg.id,
            "altitude_offset": cfg.altitude_offset,
            "speed_override": cfg.speed_override,
            "measurement_density": cfg.measurement_density,
            "custom_tolerances": cfg.custom_tolerances,
            "density": cfg.density,
        }

    return result


def list_templates(db: Session, airport_id: UUID | None = None) -> list[dict]:
    query = db.query(InspectionTemplate).options(
        joinedload(InspectionTemplate.default_config),
        joinedload(InspectionTemplate.targets),
    )

    if airport_id:
        # filter templates that target AGLs belonging to surfaces at this airport
        query = query.filter(InspectionTemplate.targets.any(AGL.surface.has(airport_id=airport_id)))

    templates = query.all()
    return [_serialize(t, db) for t in templates]


def get_template(db: Session, template_id: UUID) -> dict:
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
        raise HTTPException(status_code=404, detail="template not found")
    return _serialize(template, db)


def create_template(db: Session, data: dict) -> dict:
    config_data = data.pop("default_config", None)
    target_ids = data.pop("target_agl_ids", [])
    methods = data.pop("methods", [])

    # create config if provided
    config = None
    if config_data:
        config = InspectionConfiguration(**config_data)
        db.add(config)
        db.flush()

    template = InspectionTemplate(**data)
    if config:
        template.default_config_id = config.id

    # link target AGLs
    if target_ids:
        agls = db.query(AGL).filter(AGL.id.in_(target_ids)).all()
        template.targets = agls

    db.add(template)
    db.flush()

    # insert methods
    for method in methods:
        db.execute(insp_template_methods.insert().values(template_id=template.id, method=method))

    db.commit()
    db.refresh(template)
    return get_template(db, template.id)


def update_template(db: Session, template_id: UUID, data: dict) -> dict:
    template = (
        db.query(InspectionTemplate)
        .options(joinedload(InspectionTemplate.targets))
        .filter(InspectionTemplate.id == template_id)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="template not found")

    target_ids = data.pop("target_agl_ids", None)
    methods = data.pop("methods", None)

    for key, val in data.items():
        setattr(template, key, val)

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
    return get_template(db, template_id)


def delete_template(db: Session, template_id: UUID):
    template = db.query(InspectionTemplate).filter(InspectionTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="template not found")
    db.delete(template)
    db.commit()
