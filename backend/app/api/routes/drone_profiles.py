from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.schemas.common import DeleteResponse, ListMeta
from app.schemas.drone_profile import (
    DroneProfileCreate,
    DroneProfileListResponse,
    DroneProfileResponse,
    DroneProfileUpdate,
)
from app.services import drone_profile_service

router = APIRouter(prefix="/api/v1/drone-profiles", tags=["drone-profiles"])


@router.get("", response_model=DroneProfileListResponse)
def list_drones(db: Session = Depends(get_db)):
    """list all drone profiles with mission counts."""
    drones = drone_profile_service.list_drones(db)
    counts = drone_profile_service.get_mission_counts(db)

    data = []
    for d in drones:
        resp = DroneProfileResponse.model_validate(d)
        resp.mission_count = counts.get(d.id, 0)
        data.append(resp)

    return DroneProfileListResponse(data=data, meta=ListMeta(total=len(data)))


@router.get("/{drone_id}", response_model=DroneProfileResponse)
def get_drone(drone_id: UUID, db: Session = Depends(get_db)):
    """get drone profile by id with mission count."""
    drone = drone_profile_service.get_drone(db, drone_id)
    resp = DroneProfileResponse.model_validate(drone)
    resp.mission_count = drone_profile_service.get_mission_count(db, drone_id)
    return resp


@router.post("", status_code=201, response_model=DroneProfileResponse)
def create_drone(body: DroneProfileCreate, db: Session = Depends(get_db)):
    """create drone profile."""
    drone = drone_profile_service.create_drone(db, body)
    resp = DroneProfileResponse.model_validate(drone)
    resp.mission_count = 0
    return resp


@router.put("/{drone_id}", response_model=DroneProfileResponse)
def update_drone(drone_id: UUID, body: DroneProfileUpdate, db: Session = Depends(get_db)):
    """update drone profile."""
    drone = drone_profile_service.update_drone(db, drone_id, body)
    resp = DroneProfileResponse.model_validate(drone)
    resp.mission_count = drone_profile_service.get_mission_count(db, drone_id)
    return resp


@router.delete("/{drone_id}", response_model=DeleteResponse)
def delete_drone(drone_id: UUID, db: Session = Depends(get_db)):
    """delete drone profile - returns warnings if missions use it."""
    warnings = drone_profile_service.delete_drone(db, drone_id)

    return DeleteResponse(deleted=True, warnings=warnings)
