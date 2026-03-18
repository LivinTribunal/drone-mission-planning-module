from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import DomainError, NotFoundError
from app.models.inspection import Inspection, InspectionConfiguration, InspectionTemplate
from app.models.mission import Mission
from app.schemas.mission import InspectionCreate, InspectionUpdate
from app.services.geometry_converter import apply_dict_update, schema_to_model_data


def _get_mission(db: Session, mission_id: UUID) -> Mission:
    """get mission or raise NotFoundError."""
    mission = (
        db.query(Mission)
        .options(joinedload(Mission.inspections))
        .filter(Mission.id == mission_id)
        .first()
    )
    if not mission:
        raise NotFoundError("mission not found")

    return mission


def add_inspection(db: Session, mission_id: UUID, schema: InspectionCreate) -> Inspection:
    """add inspection to mission via aggregate root."""
    mission = _get_mission(db, mission_id)

    # validate template exists
    template = (
        db.query(InspectionTemplate).filter(InspectionTemplate.id == schema.template_id).first()
    )
    if not template:
        raise NotFoundError("template not found")

    config_data = schema.config.model_dump() if schema.config else None
    config_id = None

    if config_data:
        config = InspectionConfiguration(**config_data)
        db.add(config)
        db.flush()
        config_id = config.id

    next_order = (
        db.query(func.coalesce(func.max(Inspection.sequence_order), 0) + 1)
        .filter(Inspection.mission_id == mission_id)
        .scalar()
    )

    inspection = Inspection(
        template_id=schema.template_id,
        method=schema.method,
        config_id=config_id,
        sequence_order=next_order,
    )

    try:
        mission.add_inspection(inspection)
    except ValueError as e:
        raise DomainError(str(e), status_code=409)

    mission.regress_if_validated()
    db.commit()
    db.refresh(inspection)

    return inspection


def update_inspection(
    db: Session, mission_id: UUID, inspection_id: UUID, schema: InspectionUpdate
) -> Inspection:
    """update inspection config/sequence/method."""
    mission = _get_mission(db, mission_id)
    inspection = (
        db.query(Inspection)
        .options(joinedload(Inspection.config))
        .filter(Inspection.id == inspection_id, Inspection.mission_id == mission_id)
        .first()
    )
    if not inspection:
        raise NotFoundError("inspection not found")

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

    mission.regress_if_validated()
    db.commit()
    db.refresh(inspection)

    return inspection


def delete_inspection(db: Session, mission_id: UUID, inspection_id: UUID):
    """delete inspection and reorder remaining."""
    mission = _get_mission(db, mission_id)

    if mission.status != "DRAFT":
        raise DomainError("can only remove inspections in DRAFT status", status_code=409)

    try:
        mission.remove_inspection(inspection_id)
    except ValueError:
        raise NotFoundError("inspection not found")

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

    mission.regress_if_validated()
    db.commit()


def reorder_inspections(db: Session, mission_id: UUID, inspection_ids: list[UUID]):
    """reorder inspections by provided id list."""
    mission = _get_mission(db, mission_id)

    if mission.status != "DRAFT":
        raise DomainError("can only reorder inspections in DRAFT status", status_code=409)

    for i, insp_id in enumerate(inspection_ids, start=1):
        inspection = (
            db.query(Inspection)
            .filter(Inspection.id == insp_id, Inspection.mission_id == mission_id)
            .first()
        )
        if not inspection:
            raise NotFoundError(f"inspection {insp_id} not found")

        inspection.sequence_order = i

    mission.regress_if_validated()
    db.commit()
