from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.dependencies import OperatorUser
from app.core.dependencies import get_db
from app.core.enums import AuditAction
from app.schemas.camera_preset import (
    CameraPresetCreate,
    CameraPresetListResponse,
    CameraPresetResponse,
    CameraPresetUpdate,
)
from app.schemas.common import DeleteResponse, ListMeta
from app.services import camera_preset_service
from app.utils.audit import log_audit

router = APIRouter(prefix="/api/v1/camera-presets", tags=["camera-presets"])


@router.get("", response_model=CameraPresetListResponse)
def list_presets(
    current_user: OperatorUser,
    db: Session = Depends(get_db),
    drone_profile_id: UUID | None = None,
    is_default: bool | None = None,
):
    """list camera presets visible to current user."""
    presets = camera_preset_service.list_presets(
        db, current_user, drone_profile_id=drone_profile_id, is_default=is_default
    )
    return CameraPresetListResponse(data=presets, meta=ListMeta(total=len(presets)))


@router.get("/{preset_id}", response_model=CameraPresetResponse)
def get_preset(
    preset_id: UUID,
    current_user: OperatorUser,
    db: Session = Depends(get_db),
):
    """get camera preset by id."""
    return camera_preset_service.get_preset(db, preset_id)


@router.post("", status_code=201, response_model=CameraPresetResponse)
def create_preset(
    body: CameraPresetCreate,
    request: Request,
    current_user: OperatorUser,
    db: Session = Depends(get_db),
):
    """create camera preset."""
    if body.is_default and current_user.role not in ("COORDINATOR", "SUPER_ADMIN"):
        raise HTTPException(status_code=403, detail="only coordinators can create default presets")

    preset = camera_preset_service.create_preset(db, body, current_user)
    log_audit(
        db,
        current_user,
        AuditAction.CREATE,
        entity_type="CameraPreset",
        entity_id=preset.id,
        entity_name=preset.name,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return preset


@router.put("/{preset_id}", response_model=CameraPresetResponse)
def update_preset(
    preset_id: UUID,
    body: CameraPresetUpdate,
    request: Request,
    current_user: OperatorUser,
    db: Session = Depends(get_db),
):
    """update camera preset."""
    if body.is_default and current_user.role not in ("COORDINATOR", "SUPER_ADMIN"):
        raise HTTPException(status_code=403, detail="only coordinators can set default presets")

    preset = camera_preset_service.update_preset(db, preset_id, body, current_user)
    log_audit(
        db,
        current_user,
        AuditAction.UPDATE,
        entity_type="CameraPreset",
        entity_id=preset_id,
        entity_name=preset.name,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return preset


@router.delete("/{preset_id}", response_model=DeleteResponse)
def delete_preset(
    preset_id: UUID,
    request: Request,
    current_user: OperatorUser,
    db: Session = Depends(get_db),
):
    """delete camera preset."""
    preset = camera_preset_service.get_preset(db, preset_id)
    log_audit(
        db,
        current_user,
        AuditAction.DELETE,
        entity_type="CameraPreset",
        entity_id=preset_id,
        entity_name=preset.name,
        ip_address=request.client.host if request.client else None,
    )
    camera_preset_service.delete_preset(db, preset_id, current_user)
    return DeleteResponse(deleted=True)
