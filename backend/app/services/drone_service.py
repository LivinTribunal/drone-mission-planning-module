from uuid import UUID

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, DomainError, NotFoundError
from app.models.airport import Airport
from app.models.drone import Drone
from app.models.mission import DroneProfile, Mission
from app.schemas.drone import DroneCreate, DroneUpdate


def list_drones(db: Session, airport_id: UUID) -> list[Drone]:
    """list drones for an airport, with embedded profile loaded."""
    return (
        db.query(Drone)
        .options(joinedload(Drone.drone_profile))
        .filter(Drone.airport_id == airport_id)
        .order_by(Drone.name)
        .all()
    )


def get_mission_counts(db: Session, airport_id: UUID) -> dict[UUID, int]:
    """batch-load mission counts per drone for an airport."""
    rows = (
        db.query(Mission.drone_id, func.count(Mission.id))
        .filter(Mission.airport_id == airport_id, Mission.drone_id.isnot(None))
        .group_by(Mission.drone_id)
        .all()
    )
    return {drone_id: count for drone_id, count in rows if drone_id is not None}


def get_mission_count(db: Session, drone_id: UUID) -> int:
    """count missions currently assigned to a single drone."""
    return db.query(func.count(Mission.id)).filter(Mission.drone_id == drone_id).scalar() or 0


def get_drone(db: Session, airport_id: UUID, drone_id: UUID) -> Drone:
    """get a drone by id, scoped to the airport."""
    drone = (
        db.query(Drone)
        .options(joinedload(Drone.drone_profile))
        .filter(Drone.id == drone_id, Drone.airport_id == airport_id)
        .first()
    )
    if not drone:
        raise NotFoundError("drone not found")
    return drone


def create_drone(db: Session, airport_id: UUID, schema: DroneCreate) -> Drone:
    """create a drone under an airport using a shared profile template."""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    profile = db.query(DroneProfile).filter(DroneProfile.id == schema.drone_profile_id).first()
    if not profile:
        raise DomainError("drone profile not found")

    # duplicate name at this airport
    exists = (
        db.query(Drone).filter(Drone.airport_id == airport_id, Drone.name == schema.name).first()
    )
    if exists:
        raise ConflictError(f"a drone named '{schema.name}' already exists at this airport")

    drone = Drone(
        airport_id=airport_id,
        drone_profile_id=schema.drone_profile_id,
        name=schema.name,
        serial_number=schema.serial_number,
        notes=schema.notes,
    )

    db.add(drone)
    db.commit()
    db.refresh(drone)
    return drone


def update_drone(db: Session, airport_id: UUID, drone_id: UUID, schema: DroneUpdate) -> Drone:
    """update a fleet drone, preserving airport scope."""
    drone = db.query(Drone).filter(Drone.id == drone_id, Drone.airport_id == airport_id).first()
    if not drone:
        raise NotFoundError("drone not found")

    data = schema.model_dump(exclude_unset=True)
    if "drone_profile_id" in data and data["drone_profile_id"] is not None:
        profile = db.query(DroneProfile).filter(DroneProfile.id == data["drone_profile_id"]).first()
        if not profile:
            raise DomainError("drone profile not found")

    new_name = data.get("name")
    if new_name and new_name != drone.name:
        clash = (
            db.query(Drone)
            .filter(
                Drone.airport_id == airport_id,
                Drone.name == new_name,
                Drone.id != drone_id,
            )
            .first()
        )
        if clash:
            raise ConflictError(f"a drone named '{new_name}' already exists at this airport")

    for field, value in data.items():
        setattr(drone, field, value)

    db.commit()
    db.refresh(drone)
    return drone


def delete_drone(db: Session, airport_id: UUID, drone_id: UUID) -> list[str]:
    """delete a drone. blocked when missions still reference it."""
    drone = db.query(Drone).filter(Drone.id == drone_id, Drone.airport_id == airport_id).first()
    if not drone:
        raise NotFoundError("drone not found")

    mission_count = get_mission_count(db, drone_id)
    if mission_count > 0:
        raise ConflictError(
            f"cannot delete drone - {mission_count} mission(s) still reference it; "
            "reassign them first"
        )

    # clear airport default if it points at this drone
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if airport and airport.default_drone_id == drone.id:
        airport.default_drone_id = None

    db.delete(drone)
    db.commit()
    return []


def find_or_create_drone_for_profile(
    db: Session, airport_id: UUID, drone_profile_id: UUID
) -> Drone:
    """return an existing drone matching (airport, profile) or create one via the template.

    used by the legacy-compat shim: callers that submit drone_profile_id to
    mission / airport endpoints get an auto-materialized fleet drone instead
    of having to provision one up-front.
    """
    existing = (
        db.query(Drone)
        .filter(Drone.airport_id == airport_id, Drone.drone_profile_id == drone_profile_id)
        .order_by(Drone.created_at)
        .first()
    )
    if existing:
        return existing

    profile = db.query(DroneProfile).filter(DroneProfile.id == drone_profile_id).first()
    if not profile:
        raise DomainError("drone profile not found")

    base = profile.name or "Drone"
    name = base
    attempt = 1
    while db.query(Drone).filter(Drone.airport_id == airport_id, Drone.name == name).first():
        attempt += 1
        name = f"{base} #{attempt}"

    drone = Drone(
        airport_id=airport_id,
        drone_profile_id=drone_profile_id,
        name=name,
    )
    db.add(drone)
    try:
        db.flush()
    except IntegrityError:
        # concurrent creator won the race on (airport_id, name) - roll back the
        # failed insert and return the drone that landed first
        db.rollback()
        winner = (
            db.query(Drone)
            .filter(Drone.airport_id == airport_id, Drone.drone_profile_id == drone_profile_id)
            .order_by(Drone.created_at)
            .first()
        )
        if winner:
            return winner
        raise ConflictError(f"a drone named '{name}' already exists at this airport") from None
    return drone


def bulk_reassign_missions(
    db: Session,
    airport_id: UUID,
    target_drone_id: UUID,
    from_drone_id: UUID | None = None,
    scope: str = "ALL_DRAFT",
    mission_ids: list[UUID] | None = None,
) -> tuple[int, int, list[UUID]]:
    """bulk-reassign missions from one drone to another at an airport."""
    from app.models.enums import MissionStatus

    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    target = (
        db.query(Drone).filter(Drone.id == target_drone_id, Drone.airport_id == airport_id).first()
    )
    if not target:
        raise DomainError("target drone not found at this airport")

    updated_ids: list[UUID] = []
    regressed_count = 0

    if scope == "SELECTED":
        if not mission_ids:
            return 0, 0, []
        missions = (
            db.query(Mission)
            .filter(
                Mission.airport_id == airport_id,
                Mission.id.in_(mission_ids),
                Mission.status.in_([MissionStatus.DRAFT, MissionStatus.PLANNED]),
            )
            .all()
        )
        for mission in missions:
            was_planned = mission.status == MissionStatus.PLANNED
            mission.change_drone(target_drone_id)
            updated_ids.append(mission.id)
            if was_planned:
                regressed_count += 1
    else:
        query = db.query(Mission).filter(
            Mission.airport_id == airport_id,
            Mission.status == MissionStatus.DRAFT,
        )
        if from_drone_id:
            query = query.filter(Mission.drone_id == from_drone_id)
        draft_missions = query.all()
        for mission in draft_missions:
            mission.change_drone(target_drone_id)
            updated_ids.append(mission.id)

    db.commit()
    return len(updated_ids), regressed_count, updated_ids
