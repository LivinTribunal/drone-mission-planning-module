from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.dependencies import CoordinatorUser, OperatorUser
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
def list_drones(current_user: OperatorUser, db: Session = Depends(get_db)):
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
def get_drone(drone_id: UUID, current_user: OperatorUser, db: Session = Depends(get_db)):
    """get drone profile by id with mission count."""
    drone = drone_profile_service.get_drone(db, drone_id)
    resp = DroneProfileResponse.model_validate(drone)
    resp.mission_count = drone_profile_service.get_mission_count(db, drone_id)
    return resp


@router.post("", status_code=201, response_model=DroneProfileResponse)
def create_drone(
    body: DroneProfileCreate,
    current_user: CoordinatorUser,
    db: Session = Depends(get_db),
):
    """create drone profile."""
    drone = drone_profile_service.create_drone(db, body)
    resp = DroneProfileResponse.model_validate(drone)
    resp.mission_count = 0
    return resp


@router.put("/{drone_id}", response_model=DroneProfileResponse)
def update_drone(
    drone_id: UUID,
    body: DroneProfileUpdate,
    current_user: CoordinatorUser,
    db: Session = Depends(get_db),
):
    """update drone profile."""
    drone = drone_profile_service.update_drone(db, drone_id, body)
    resp = DroneProfileResponse.model_validate(drone)
    resp.mission_count = drone_profile_service.get_mission_count(db, drone_id)
    return resp


@router.delete("/{drone_id}", response_model=DeleteResponse)
def delete_drone(
    drone_id: UUID,
    current_user: CoordinatorUser,
    db: Session = Depends(get_db),
):
    """delete drone profile - returns warnings if missions use it."""
    warnings = drone_profile_service.delete_drone(db, drone_id)

    return DeleteResponse(deleted=True, warnings=warnings)


@router.post("/{drone_id}/model")
async def upload_drone_model(
    drone_id: UUID,
    file: UploadFile,
    current_user: CoordinatorUser,
    db: Session = Depends(get_db),
):
    """upload a custom 3d model file for a drone profile."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="no file provided")

    content = await file.read()
    identifier = drone_profile_service.upload_drone_model(db, drone_id, content, file.filename)

    return {
        "model_identifier": identifier,
        "model_url": f"/static/models/custom/{identifier}",
    }


@router.get("/{drone_id}/model")
def get_drone_model(drone_id: UUID, current_user: OperatorUser, db: Session = Depends(get_db)):
    """serve a custom uploaded model file."""
    drone = drone_profile_service.get_drone(db, drone_id)
    if not drone.model_identifier:
        raise HTTPException(status_code=404, detail="no model assigned")

    path = drone_profile_service.get_drone_model_path(drone_id, drone.model_identifier)
    return FileResponse(path, media_type="model/gltf-binary")
