from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

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
        raise HTTPException(status_code=404, detail="mission not found")

    try:
        mission.transition_to(target_status)
    except ValueError as e:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "invalid status transition",
                "current_status": mission.status,
                "target_status": target_status,
                "allowed_transitions": TRANSITIONS.get(mission.status, []),
                "message": str(e),
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
        .options(joinedload(Mission.inspections))
        .filter(Mission.id == mission_id)
        .first()
    )
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    return mission


def create_mission(db: Session, schema: MissionCreate) -> Mission:
    """create mission in DRAFT status."""
    airport = db.query(Airport).filter(Airport.id == schema.airport_id).first()
    if not airport:
        raise HTTPException(status_code=400, detail="airport not found")

    if schema.drone_profile_id:
        drone = db.query(DroneProfile).filter(DroneProfile.id == schema.drone_profile_id).first()
        if not drone:
            raise HTTPException(status_code=400, detail="drone profile not found")

    mission = Mission(**schema_to_model_data(schema))
    db.add(mission)
    db.commit()
    db.refresh(mission)

    return mission


def update_mission(db: Session, mission_id: UUID, schema: MissionUpdate) -> Mission:
    """update mission - regresses VALIDATED -> PLANNED on trajectory changes."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    data = schema.model_dump(exclude_unset=True)

    # check if trajectory-affecting fields changed
    trajectory_changed = any(k in TRAJECTORY_FIELDS for k in data.keys())
    if trajectory_changed:
        mission.regress_if_validated()

    apply_schema_update(mission, schema)
    db.commit()
    db.refresh(mission)

    return mission


def delete_mission(db: Session, mission_id: UUID):
    """delete mission."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    db.delete(mission)
    db.commit()


def duplicate_mission(db: Session, mission_id: UUID) -> Mission:
    """duplicate mission as new DRAFT."""
    original = (
        db.query(Mission)
        .options(joinedload(Mission.inspections).joinedload(Inspection.config))
        .filter(Mission.id == mission_id)
        .first()
    )
    if not original:
        raise HTTPException(status_code=404, detail="mission not found")

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
            new_config = InspectionConfiguration(
                altitude_offset=insp.config.altitude_offset,
                speed_override=insp.config.speed_override,
                measurement_density=insp.config.measurement_density,
                custom_tolerances=insp.config.custom_tolerances,
                density=insp.config.density,
                hover_duration=insp.config.hover_duration,
                horizontal_distance=insp.config.horizontal_distance,
                sweep_angle=insp.config.sweep_angle,
            )
            db.add(new_config)
            db.flush()
            new_config_id = new_config.id

        db.add(
            Inspection(
                mission_id=copy.id,
                template_id=insp.template_id,
                config_id=new_config_id,
                method=insp.method,
                sequence_order=insp.sequence_order,
            )
        )

    db.commit()
    db.refresh(copy)

    return copy
