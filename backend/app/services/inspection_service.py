from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import DomainError, NotFoundError
from app.models.inspection import Inspection, InspectionConfiguration, InspectionTemplate
from app.models.mission import Mission
from app.schemas.mission import InspectionCreate, InspectionUpdate
from app.services.geometry_converter import apply_dict_update


def _get_mission(db: Session, mission_id: UUID, for_update: bool = False) -> Mission:
    """get mission or raise NotFoundError."""
    if for_update:
        # lock the row first, then load relationships with populate_existing
        db.query(Mission).filter(Mission.id == mission_id).with_for_update().first()

    mission = (
        db.query(Mission)
        .options(joinedload(Mission.inspections), joinedload(Mission.flight_plan))
        .filter(Mission.id == mission_id)
        .execution_options(populate_existing=True)
        .first()
    )
    if not mission:
        raise NotFoundError("mission not found")

    return mission


def _delete_flight_plan_if_exists(db: Session, mission: Mission) -> None:
    """delete flight plan from db before trajectory invalidation."""
    if mission.flight_plan:
        db.delete(mission.flight_plan)
        db.flush()


def add_inspection(db: Session, mission_id: UUID, schema: InspectionCreate) -> Inspection:
    """add inspection to mission via aggregate root."""
    mission = _get_mission(db, mission_id, for_update=True)

    # validate template exists
    template = (
        db.query(InspectionTemplate).filter(InspectionTemplate.id == schema.template_id).first()
    )
    if not template:
        raise NotFoundError("template not found")

    config_data = schema.config.model_dump(mode="json") if schema.config else None
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

    _delete_flight_plan_if_exists(db, mission)
    try:
        mission.add_inspection(inspection)
    except ValueError as e:
        raise DomainError(str(e), status_code=409)

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
    data.pop("config", None)
    config_data = (
        schema.config.model_dump(mode="json", exclude_unset=True) if schema.config else None
    )

    if config_data:
        if inspection.config:
            apply_dict_update(inspection.config, config_data)
        else:
            config = InspectionConfiguration(**config_data)
            db.add(config)
            db.flush()
            inspection.config_id = config.id

    apply_dict_update(inspection, data)

    _delete_flight_plan_if_exists(db, mission)
    try:
        mission.invalidate_trajectory()
    except ValueError as e:
        raise DomainError(str(e), status_code=409)

    db.commit()
    db.refresh(inspection)

    return inspection


def delete_inspection(db: Session, mission_id: UUID, inspection_id: UUID):
    """delete inspection and reorder remaining."""
    mission = _get_mission(db, mission_id)

    # terminal-state check before remove - gives 409, not 404
    if mission.status in Mission._TERMINAL:
        raise DomainError(
            "cannot modify mission after export - duplicate to make changes", status_code=409
        )

    _delete_flight_plan_if_exists(db, mission)
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

    db.commit()


def reorder_inspections(db: Session, mission_id: UUID, inspection_ids: list[UUID]):
    """reorder inspections by provided id list."""
    mission = _get_mission(db, mission_id)

    _delete_flight_plan_if_exists(db, mission)
    try:
        mission.invalidate_trajectory()
    except ValueError as e:
        raise DomainError(str(e), status_code=409)

    # validate inspection_ids matches mission inspections exactly
    existing_ids = {insp.id for insp in mission.inspections}
    provided_ids = set(inspection_ids)
    if existing_ids != provided_ids:
        missing = existing_ids - provided_ids
        extra = provided_ids - existing_ids
        parts = []
        if missing:
            parts.append(f"missing: {sorted(str(i) for i in missing)}")
        if extra:
            parts.append(f"unknown: {sorted(str(i) for i in extra)}")
        raise DomainError(f"inspection_ids mismatch - {', '.join(parts)}", status_code=400)

    for i, insp_id in enumerate(inspection_ids, start=1):
        inspection = (
            db.query(Inspection)
            .filter(Inspection.id == insp_id, Inspection.mission_id == mission_id)
            .first()
        )
        if not inspection:
            raise NotFoundError(f"inspection {insp_id} not found")

        inspection.sequence_order = i

    db.commit()
