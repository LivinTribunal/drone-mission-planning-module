from uuid import UUID

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.mission import DroneProfile, Mission
from app.schemas.drone_profile import DroneProfileCreate, DroneProfileUpdate
from app.services.geometry_converter import apply_schema_update, schema_to_model_data


def list_drones(db: Session) -> list[DroneProfile]:
    """list all drone profiles"""
    return db.query(DroneProfile).all()


def get_drone(db: Session, drone_id: UUID) -> DroneProfile:
    """get drone profile by id"""
    drone = db.query(DroneProfile).filter(DroneProfile.id == drone_id).first()
    if not drone:
        raise NotFoundError("drone profile not found")

    return drone


def create_drone(db: Session, schema: DroneProfileCreate) -> DroneProfile:
    """create drone profile"""
    drone = DroneProfile(**schema_to_model_data(schema))
    db.add(drone)
    db.commit()
    db.refresh(drone)

    return drone


def update_drone(db: Session, drone_id: UUID, schema: DroneProfileUpdate) -> DroneProfile:
    """update drone profile"""
    drone = db.query(DroneProfile).filter(DroneProfile.id == drone_id).first()
    if not drone:
        raise NotFoundError("drone profile not found")

    apply_schema_update(drone, schema)

    db.commit()
    db.refresh(drone)

    return drone


def delete_drone(db: Session, drone_id: UUID) -> list[str]:
    """delete drone profile, returns warnings for missions using it"""
    drone = db.query(DroneProfile).filter(DroneProfile.id == drone_id).first()
    if not drone:
        raise NotFoundError("drone profile not found")

    # check missions using this drone - FK is ON DELETE SET NULL so missions
    # keep existing but lose their drone reference after deletion
    missions = db.query(Mission).filter(Mission.drone_profile_id == drone_id).all()
    warnings = [f"mission '{mission.name}' uses this drone" for mission in missions]

    db.delete(drone)
    db.commit()

    return warnings
