from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.inspection import Inspection, InspectionConfiguration
from app.models.mission import Mission
from app.services.geo import geojson_to_ewkt, wkb_to_geojson

# status state machine - maps current status to allowed transitions
TRANSITIONS = {
    "DRAFT": ["PLANNED"],
    "PLANNED": ["VALIDATED"],
    "VALIDATED": ["EXPORTED"],
    "EXPORTED": ["COMPLETED", "CANCELLED"],
    "COMPLETED": [],
    "CANCELLED": [],
}

# fields that affect trajectory - changing these regresses VALIDATED -> PLANNED
TRAJECTORY_FIELDS = {
    "drone_profile_id",
    "default_speed",
    "default_altitude_offset",
    "takeoff_coordinate",
    "landing_coordinate",
}

MISSION_GEOM = ["takeoff_coordinate", "landing_coordinate"]


def _enrich(mission: Mission, db: Session) -> Mission:
    """convert geometry fields and detach from session"""
    tc = wkb_to_geojson(mission.takeoff_coordinate, db)
    lc = wkb_to_geojson(mission.landing_coordinate, db)
    db.expunge(mission)
    mission.takeoff_coordinate = tc
    mission.landing_coordinate = lc

    return mission


def _enrich_detail(mission: Mission, db: Session) -> Mission:
    """convert geometry and keep inspections accessible"""
    tc = wkb_to_geojson(mission.takeoff_coordinate, db)
    lc = wkb_to_geojson(mission.landing_coordinate, db)
    inspections = sorted(mission.inspections, key=lambda i: i.sequence_order)
    db.expunge(mission)
    mission.takeoff_coordinate = tc
    mission.landing_coordinate = lc
    mission.inspections = inspections

    return mission


def _transition(mission: Mission, target_status: str):
    """validate and do a status transition"""
    allowed = TRANSITIONS.get(mission.status, [])
    if target_status not in allowed:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "invalid status transition",
                "current_status": mission.status,
                "target_status": target_status,
                "allowed_transitions": allowed,
            },
        )
    mission.status = target_status


def _transition_mission(db: Session, mission_id: UUID, target_status: str) -> Mission:
    """load mission, do a status transition, commit, and return enriched"""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    _transition(mission, target_status)
    db.commit()
    db.refresh(mission)

    return _enrich(mission, db)


def list_missions(
    db: Session,
    airport_id: UUID | None = None,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Mission], int]:
    """list missions with optional filters and pagination"""
    query = db.query(Mission)

    if airport_id:
        query = query.filter(Mission.airport_id == airport_id)
    if status:
        query = query.filter(Mission.status == status)

    total = query.count()
    missions = query.order_by(Mission.created_at.desc()).offset(offset).limit(limit).all()

    return [_enrich(m, db) for m in missions], total


def get_mission(db: Session, mission_id: UUID) -> Mission:
    """get mission with inspections"""
    mission = (
        db.query(Mission)
        .options(joinedload(Mission.inspections))
        .filter(Mission.id == mission_id)
        .first()
    )
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    return _enrich_detail(mission, db)


# TODO: add validation and create a data model for mission
def create_mission(db: Session, data: dict) -> Mission:
    """create mission in DRAFT status"""
    mission = Mission()
    for key, val in data.items():
        if key in MISSION_GEOM and val is not None:
            setattr(mission, key, geojson_to_ewkt(val))
        else:
            setattr(mission, key, val)

    db.add(mission)
    db.commit()
    db.refresh(mission)

    return _enrich(mission, db)


def update_mission(db: Session, mission_id: UUID, data: dict) -> Mission:
    """update mission - regresses VALIDATED -> PLANNED on trajectory changes"""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    # check if trajectory-affecting fields changed
    trajectory_changed = any(k in TRAJECTORY_FIELDS for k in data.keys())
    if trajectory_changed and mission.status == "VALIDATED":
        mission.status = "PLANNED"

    for key, val in data.items():
        if key in MISSION_GEOM and val is not None:
            setattr(mission, key, geojson_to_ewkt(val))
        else:
            setattr(mission, key, val)

    db.commit()
    db.refresh(mission)

    return _enrich(mission, db)


def delete_mission(db: Session, mission_id: UUID):
    """delete mission"""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    db.delete(mission)
    db.commit()


def duplicate_mission(db: Session, mission_id: UUID) -> Mission:
    """duplicate mission as new DRAFT"""
    original = (
        db.query(Mission)
        .options(joinedload(Mission.inspections))
        .filter(Mission.id == mission_id)
        .first()
    )
    if not original:
        raise HTTPException(status_code=404, detail="mission not found")

    # TODO: add validation and create a data model for mission
    copy = Mission(
        name=f"{original.name} (copy)",
        status="DRAFT",
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
        # copy config if exists
        new_config_id = None
        if insp.config:
            new_config = InspectionConfiguration(
                altitude_offset=insp.config.altitude_offset,
                speed_override=insp.config.speed_override,
                measurement_density=insp.config.measurement_density,
                custom_tolerances=insp.config.custom_tolerances,
                density=insp.config.density,
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

    return _enrich(copy, db)


# status transitions
# TODO: refactor these functions into one
def validate_mission(db: Session, mission_id: UUID) -> Mission:
    """PLANNED -> VALIDATED"""
    return _transition_mission(db, mission_id, "VALIDATED")


def export_mission(db: Session, mission_id: UUID) -> Mission:
    """VALIDATED -> EXPORTED"""
    return _transition_mission(db, mission_id, "EXPORTED")


def complete_mission(db: Session, mission_id: UUID) -> Mission:
    """EXPORTED -> COMPLETED"""
    return _transition_mission(db, mission_id, "COMPLETED")


def cancel_mission(db: Session, mission_id: UUID) -> Mission:
    """EXPORTED -> CANCELLED"""
    return _transition_mission(db, mission_id, "CANCELLED")
