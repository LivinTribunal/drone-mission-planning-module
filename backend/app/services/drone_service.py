from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.mission import DroneProfile, Mission


def list_drones(db: Session) -> list[DroneProfile]:
    return db.query(DroneProfile).all()


def get_drone(db: Session, drone_id: UUID) -> DroneProfile:
    drone = db.query(DroneProfile).filter(DroneProfile.id == drone_id).first()
    if not drone:
        raise HTTPException(status_code=404, detail="drone profile not found")
    return drone


def create_drone(db: Session, data: dict) -> DroneProfile:
    drone = DroneProfile(**data)
    db.add(drone)
    db.commit()
    db.refresh(drone)
    return drone


def update_drone(db: Session, drone_id: UUID, data: dict) -> DroneProfile:
    drone = db.query(DroneProfile).filter(DroneProfile.id == drone_id).first()
    if not drone:
        raise HTTPException(status_code=404, detail="drone profile not found")
    for key, val in data.items():
        setattr(drone, key, val)
    db.commit()
    db.refresh(drone)
    return drone


def delete_drone(db: Session, drone_id: UUID) -> list[str]:
    drone = db.query(DroneProfile).filter(DroneProfile.id == drone_id).first()
    if not drone:
        raise HTTPException(status_code=404, detail="drone profile not found")

    # check missions using this drone
    missions = db.query(Mission).filter(Mission.drone_profile_id == drone_id).all()
    warnings = [f"mission '{m.name}' uses this drone" for m in missions]

    db.delete(drone)
    db.commit()
    return warnings
