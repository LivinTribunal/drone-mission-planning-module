from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError, NotFoundError
from app.models.camera_preset import CameraPreset
from app.models.inspection import InspectionConfiguration
from app.models.user import User
from app.schemas.camera_preset import CameraPresetCreate, CameraPresetUpdate
from app.services.geometry_converter import apply_schema_update, schema_to_model_data


def list_presets(
    db: Session,
    user: User,
    drone_profile_id: UUID | None = None,
    is_default: bool | None = None,
) -> list[CameraPreset]:
    """list presets visible to user: defaults + own presets."""
    query = db.query(CameraPreset)
    if user.role not in ("COORDINATOR", "SUPER_ADMIN"):
        query = query.filter(
            or_(CameraPreset.is_default.is_(True), CameraPreset.created_by == user.id)
        )

    if drone_profile_id is not None:
        query = query.filter(
            or_(
                CameraPreset.drone_profile_id == drone_profile_id,
                CameraPreset.drone_profile_id.is_(None),
            )
        )

    if is_default is not None:
        query = query.filter(CameraPreset.is_default == is_default)

    return query.order_by(CameraPreset.is_default.desc(), CameraPreset.name).all()


def get_preset(db: Session, preset_id: UUID) -> CameraPreset:
    """get preset by id."""
    preset = db.query(CameraPreset).filter(CameraPreset.id == preset_id).first()
    if not preset:
        raise NotFoundError("camera preset not found")
    return preset


def create_preset(db: Session, schema: CameraPresetCreate, user: User) -> CameraPreset:
    """create camera preset."""
    data = schema_to_model_data(schema)
    data["created_by"] = user.id
    preset = CameraPreset(**data)
    db.add(preset)
    db.flush()
    db.refresh(preset)
    return preset


def update_preset(
    db: Session, preset_id: UUID, schema: CameraPresetUpdate, user: User
) -> CameraPreset:
    """update camera preset with ownership check."""
    preset = get_preset(db, preset_id)
    _check_access(preset, user)
    apply_schema_update(preset, schema)
    db.flush()
    db.refresh(preset)
    return preset


def delete_preset(db: Session, preset: CameraPreset, user: User) -> None:
    """delete camera preset, nullifying references."""
    _check_access(preset, user)

    # nullify FK on inspection configurations referencing this preset
    db.query(InspectionConfiguration).filter(
        InspectionConfiguration.camera_preset_id == preset.id
    ).update({"camera_preset_id": None})

    db.delete(preset)
    db.commit()


def _check_access(preset: CameraPreset, user: User) -> None:
    """verify user can modify this preset."""
    if user.role in ("COORDINATOR", "SUPER_ADMIN"):
        return
    if preset.created_by != user.id or preset.is_default:
        raise DomainError("you can only modify your own presets", status_code=403)
