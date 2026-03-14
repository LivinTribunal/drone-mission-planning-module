from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

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


def _serialize(mission: Mission, db: Session) -> dict:
    """serialize mission with geometry conversion"""
    result = {}
    for col in mission.__table__.columns:
        val = getattr(mission, col.name)
        if col.name in MISSION_GEOM:
            result[col.name] = wkb_to_geojson(val, db)
        else:
            result[col.name] = val

    return result


def _serialize_detail(mission: Mission, db: Session) -> dict:
    """serialize mission with inspections"""
    d = _serialize(mission, db)
    d["inspections"] = [
        {
            "id": insp.id,
            "mission_id": insp.mission_id,
            "template_id": insp.template_id,
            "config_id": insp.config_id,
            "method": insp.method,
            "sequence_order": insp.sequence_order,
        }
        for insp in sorted(mission.inspections, key=lambda i: i.sequence_order)
    ]

    return d


def _transition(mission: Mission, target_status: str):
    """validate and apply status transition"""
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


def list_missions(
    db: Session,
    airport_id: UUID | None = None,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """list missions with optional filters and pagination"""
    query = db.query(Mission)

    if status:
        query = query.filter(Mission.status == status)

    total = query.count()
    missions = query.order_by(Mission.created_at.desc()).offset(offset).limit(limit).all()

    return [_serialize(m, db) for m in missions], total


def get_mission(db: Session, mission_id: UUID) -> dict:
    """get mission with inspections"""
    mission = (
        db.query(Mission)
        .options(joinedload(Mission.inspections))
        .filter(Mission.id == mission_id)
        .first()
    )
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    return _serialize_detail(mission, db)


def create_mission(db: Session, data: dict) -> dict:
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

    return _serialize(mission, db)


def update_mission(db: Session, mission_id: UUID, data: dict) -> dict:
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

    return _serialize(mission, db)


def delete_mission(db: Session, mission_id: UUID):
    """delete mission"""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    db.delete(mission)
    db.commit()


def duplicate_mission(db: Session, mission_id: UUID) -> dict:
    """duplicate mission as new DRAFT"""
    original = (
        db.query(Mission)
        .options(joinedload(Mission.inspections))
        .filter(Mission.id == mission_id)
        .first()
    )
    if not original:
        raise HTTPException(status_code=404, detail="mission not found")

    copy = Mission(
        name=f"{original.name} (copy)",
        status="DRAFT",
        drone_profile_id=original.drone_profile_id,
        operator_notes=original.operator_notes,
        default_speed=original.default_speed,
        default_altitude_offset=original.default_altitude_offset,
        takeoff_coordinate=original.takeoff_coordinate,
        landing_coordinate=original.landing_coordinate,
    )
    db.add(copy)
    db.flush()

    from app.models.inspection import Inspection, InspectionConfiguration

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

    return _serialize(copy, db)


# status transitions


def validate_mission(db: Session, mission_id: UUID) -> dict:
    """PLANNED -> VALIDATED"""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    _transition(mission, "VALIDATED")
    db.commit()
    db.refresh(mission)

    return _serialize(mission, db)


def export_mission(db: Session, mission_id: UUID) -> dict:
    """VALIDATED -> EXPORTED"""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    _transition(mission, "EXPORTED")
    db.commit()
    db.refresh(mission)

    return _serialize(mission, db)


def complete_mission(db: Session, mission_id: UUID) -> dict:
    """EXPORTED -> COMPLETED"""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    _transition(mission, "COMPLETED")
    db.commit()
    db.refresh(mission)

    return _serialize(mission, db)


def cancel_mission(db: Session, mission_id: UUID) -> dict:
    """EXPORTED -> CANCELLED"""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="mission not found")

    _transition(mission, "CANCELLED")
    db.commit()
    db.refresh(mission)

    return _serialize(mission, db)
