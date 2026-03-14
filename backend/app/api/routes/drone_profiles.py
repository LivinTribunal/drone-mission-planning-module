from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.schemas.drone_profile import (
    DroneProfileCreate,
    DroneProfileListResponse,
    DroneProfileResponse,
    DroneProfileUpdate,
)
from app.services import drone_service

router = APIRouter(prefix="/api/v1/drone-profiles", tags=["drone-profiles"])


@router.get("", response_model=DroneProfileListResponse)
def list_drones(db: Session = Depends(get_db)):
    """list all drone profiles"""
    drones = drone_service.list_drones(db)

    return {"data": drones, "meta": {"total": len(drones)}}


@router.get("/{drone_id}", response_model=DroneProfileResponse)
def get_drone(drone_id: UUID, db: Session = Depends(get_db)):
    """get drone profile by id"""
    return drone_service.get_drone(db, drone_id)


@router.post("", status_code=201, response_model=DroneProfileResponse)
def create_drone(body: DroneProfileCreate, db: Session = Depends(get_db)):
    """create drone profile"""
    return drone_service.create_drone(db, body.model_dump())


@router.put("/{drone_id}", response_model=DroneProfileResponse)
def update_drone(drone_id: UUID, body: DroneProfileUpdate, db: Session = Depends(get_db)):
    """update drone profile"""
    data = body.model_dump(exclude_unset=True)

    return drone_service.update_drone(db, drone_id, data)


@router.delete("/{drone_id}")
def delete_drone(drone_id: UUID, db: Session = Depends(get_db)):
    """delete drone profile - returns warnings if missions use it"""
    warnings = drone_service.delete_drone(db, drone_id)

    return {"deleted": True, "warnings": warnings}
