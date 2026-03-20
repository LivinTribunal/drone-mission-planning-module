from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import DomainError, NotFoundError
from app.models.airport import Airport
from app.models.enums import MissionStatus
from app.models.inspection import Inspection, InspectionConfiguration
from app.models.mission import TRAJECTORY_FIELDS, TRANSITIONS, DroneProfile, Mission
from app.schemas.mission import MissionCreate, MissionUpdate
from app.services.geometry_converter import apply_schema_update, schema_to_model_data


def transition_mission(db: Session, mission_id: UUID, target_status: str) -> Mission:
    """validate and execute status transition via aggregate root."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise NotFoundError("mission not found")

    try:
        mission.transition_to(target_status)
    except ValueError:
        raise DomainError(
            "invalid status transition",
            status_code=409,
            extra={
                "error": "invalid status transition",
                "current_status": mission.status,
                "target_status": target_status,
                "allowed_transitions": TRANSITIONS.get(mission.status, []),
            },
        )

    db.commit()
    db.refresh(mission)

    return mission


def list_missions(
    db: Session,
    airport_id: UUID | None = None,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Mission], int]:
    """list missions with optional filters and pagination."""
    query = db.query(Mission)

    if airport_id:
        query = query.filter(Mission.airport_id == airport_id)
    if status:
        query = query.filter(Mission.status == status)

    total = query.count()
    missions = query.order_by(Mission.created_at.desc()).offset(offset).limit(limit).all()

    return missions, total


def get_mission(db: Session, mission_id: UUID) -> Mission:
    """get mission with inspections."""
    mission = (
        db.query(Mission)
        .options(joinedload(Mission.inspections).joinedload(Inspection.config))
        .filter(Mission.id == mission_id)
        .first()
    )
    if not mission:
        raise NotFoundError("mission not found")

    return mission


def create_mission(db: Session, schema: MissionCreate) -> Mission:
    """create mission in DRAFT status."""
    airport = db.query(Airport).filter(Airport.id == schema.airport_id).first()
    if not airport:
        raise DomainError("airport not found")

    if schema.drone_profile_id:
        drone = db.query(DroneProfile).filter(DroneProfile.id == schema.drone_profile_id).first()
        if not drone:
            raise DomainError("drone profile not found")

    mission = Mission(**schema_to_model_data(schema))
    db.add(mission)
    db.commit()
    db.refresh(mission)

    return mission


def update_mission(db: Session, mission_id: UUID, schema: MissionUpdate) -> Mission:
    """update mission - invalidates trajectory on config changes."""
    mission = (
        db.query(Mission)
        .options(joinedload(Mission.flight_plan))
        .filter(Mission.id == mission_id)
        .first()
    )
    if not mission:
        raise NotFoundError("mission not found")

    data = schema.model_dump(exclude_unset=True)

    # trajectory-affecting fields changed - regress to DRAFT
    trajectory_changed = any(k in TRAJECTORY_FIELDS for k in data.keys())
    if trajectory_changed:
        if mission.flight_plan:
            db.delete(mission.flight_plan)
            db.flush()
        try:
            mission.invalidate_trajectory()
        except ValueError as e:
            raise DomainError(str(e), status_code=409)

    apply_schema_update(mission, schema)
    db.commit()
    db.refresh(mission)

    return mission


def delete_mission(db: Session, mission_id: UUID):
    """delete mission."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise NotFoundError("mission not found")

    db.delete(mission)
    db.commit()


def duplicate_mission(db: Session, mission_id: UUID) -> Mission:
    """duplicate mission as new DRAFT.

    runs in a single db session that auto-rolls back on exception via the
    get_db dependency, so no explicit try/except is needed here.
    """
    original = (
        db.query(Mission)
        .options(joinedload(Mission.inspections).joinedload(Inspection.config))
        .filter(Mission.id == mission_id)
        .first()
    )
    if not original:
        raise NotFoundError("mission not found")

    copy = Mission(
        name=f"{original.name} (copy)",
        status=MissionStatus.DRAFT,
        airport_id=original.airport_id,
        drone_profile_id=original.drone_profile_id,
        operator_notes=original.operator_notes,
        default_speed=original.default_speed,
        default_altitude_offset=original.default_altitude_offset,
        takeoff_coordinate=original.takeoff_coordinate,
        landing_coordinate=original.landing_coordinate,
    )
    db.add(copy)
    db.flush()

    for insp in original.inspections:
        new_config_id = None
        if insp.config:
            config_fields = {
                f: getattr(insp.config, f) for f in InspectionConfiguration._MERGE_FIELDS
            }
            new_config = InspectionConfiguration(**config_fields)
            db.add(new_config)
            db.flush()
            new_config_id = new_config.id

        new_insp = Inspection(
            template_id=insp.template_id,
            config_id=new_config_id,
            method=insp.method,
            sequence_order=insp.sequence_order,
        )
        copy.add_inspection(new_insp)

    db.commit()
    db.refresh(copy)

    return copy
