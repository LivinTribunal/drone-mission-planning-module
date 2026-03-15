from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.inspection import Inspection, InspectionConfiguration, InspectionTemplate
from app.models.mission import Mission
from app.schemas.mission import InspectionCreate, InspectionUpdate
from app.services.geometry_converter import apply_dict_update, schema_to_model_data

# max number of inspections per mission
MAX_INSPECTIONS = 10


def _get_mission(db: Session, mission_id: UUID) -> Mission:
    """get mission or 404"""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    return mission


def _regress_when_changed(mission: Mission):
    """regress VALIDATED -> PLANNED on inspection changes"""
    if mission.status == "VALIDATED":
        mission.status = "PLANNED"


def add_inspection(db: Session, mission_id: UUID, schema: InspectionCreate) -> Inspection:
    """add inspection to mission from template"""
    mission = _get_mission(db, mission_id)

    # validate template exists
    template = (
        db.query(InspectionTemplate).filter(InspectionTemplate.id == schema.template_id).first()
    )
    if not template:
        raise HTTPException(status_code=400, detail="template not found")

    # check max inspections limit
    count = db.query(Inspection).filter(Inspection.mission_id == mission_id).count()
    if count >= MAX_INSPECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"mission already has {MAX_INSPECTIONS} inspections (max limit)",
        )

    config_data = schema.config.model_dump() if schema.config else None
    config_id = None

    if config_data:
        config = InspectionConfiguration(**config_data)
        db.add(config)
        db.flush()
        config_id = config.id

    # TODO: consider saving last sequence number on mission model
    next_order = (
        db.query(func.coalesce(func.max(Inspection.sequence_order), 0) + 1)
        .filter(Inspection.mission_id == mission_id)
        .scalar()
    )

    inspection = Inspection(
        mission_id=mission_id,
        template_id=schema.template_id,
        method=schema.method,
        config_id=config_id,
        sequence_order=next_order,
    )
    db.add(inspection)

    _regress_when_changed(mission)
    db.commit()
    db.refresh(inspection)

    return inspection


def update_inspection(
    db: Session, mission_id: UUID, inspection_id: UUID, schema: InspectionUpdate
) -> Inspection:
    """update inspection config/sequence/method"""
    mission = _get_mission(db, mission_id)
    inspection = (
        db.query(Inspection)
        .options(joinedload(Inspection.config))
        .filter(Inspection.id == inspection_id, Inspection.mission_id == mission_id)
        .first()
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="inspection not found")

    data = schema.model_dump(exclude_unset=True)
    config_data = data.pop("config", None)

    if config_data:
        if inspection.config:
            apply_dict_update(inspection.config, config_data)
        else:
            config = InspectionConfiguration(**schema_to_model_data(schema.config))
            db.add(config)
            db.flush()
            inspection.config_id = config.id

    apply_dict_update(inspection, data)

    _regress_when_changed(mission)
    db.commit()
    db.refresh(inspection)

    return inspection


def delete_inspection(db: Session, mission_id: UUID, inspection_id: UUID):
    """delete inspection and reorder remaining"""
    mission = _get_mission(db, mission_id)
    inspection = (
        db.query(Inspection)
        .filter(Inspection.id == inspection_id, Inspection.mission_id == mission_id)
        .first()
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="inspection not found")

    db.delete(inspection)
    db.flush()

    # reorder remaining
    remaining = (
        db.query(Inspection)
        .filter(Inspection.mission_id == mission_id)
        .order_by(Inspection.sequence_order)
        .all()
    )
    for i, insp in enumerate(remaining, start=1):
        insp.sequence_order = i

    _regress_when_changed(mission)
    db.commit()


def reorder_inspections(db: Session, mission_id: UUID, inspection_ids: list[UUID]):
    """reorder inspections by provided id list"""
    mission = _get_mission(db, mission_id)

    for i, insp_id in enumerate(inspection_ids, start=1):
        inspection = (
            db.query(Inspection)
            .filter(Inspection.id == insp_id, Inspection.mission_id == mission_id)
            .first()
        )
        if not inspection:
            raise HTTPException(status_code=404, detail=f"inspection {insp_id} not found")

        inspection.sequence_order = i

    _regress_when_changed(mission)
    db.commit()
