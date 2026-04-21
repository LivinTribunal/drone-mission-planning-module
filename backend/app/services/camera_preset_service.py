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
    if not user.is_privileged():
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
    """fetch preset by id without visibility check."""
    preset = db.query(CameraPreset).filter(CameraPreset.id == preset_id).first()
    if not preset:
        raise NotFoundError("camera preset not found")
    return preset


def get_preset_for_user(db: Session, preset_id: UUID, user: User) -> CameraPreset:
    """fetch preset enforcing visibility; hides non-visible presets as 404."""
    preset = get_preset(db, preset_id)
    if user.is_privileged():
        return preset
    if preset.is_default or preset.created_by == user.id:
        return preset
    raise NotFoundError("camera preset not found")


def create_preset(db: Session, schema: CameraPresetCreate, user: User) -> CameraPreset:
    """create camera preset; only privileged users may set is_default."""
    if schema.is_default and not user.is_privileged():
        raise DomainError("only coordinators can create default presets", status_code=403)

    data = schema_to_model_data(schema)
    data["created_by"] = user.id
    preset = CameraPreset(**data)
    # demote BEFORE insert so the partial unique index (one default per
    # drone_profile) never observes two defaults at once
    if preset.is_default:
        preset.demote_sibling_defaults(db)
    db.add(preset)
    db.flush()
    db.refresh(preset)
    return preset


def update_preset(
    db: Session, preset_id: UUID, schema: CameraPresetUpdate, user: User
) -> CameraPreset:
    """update camera preset; enforces ownership and is_default privilege."""
    if schema.is_default and not user.is_privileged():
        raise DomainError("only coordinators can set default presets", status_code=403)

    preset = get_preset(db, preset_id)
    _check_write_access(preset, user)
    apply_schema_update(preset, schema)
    if preset.is_default:
        preset.demote_sibling_defaults(db)
    db.flush()
    db.refresh(preset)
    return preset


def delete_preset(db: Session, preset_id: UUID, user: User) -> CameraPreset:
    """delete camera preset, nullifying inspection references."""
    preset = get_preset(db, preset_id)
    _check_write_access(preset, user)

    db.query(InspectionConfiguration).filter(
        InspectionConfiguration.camera_preset_id == preset.id
    ).update({"camera_preset_id": None}, synchronize_session=False)

    db.delete(preset)
    db.flush()
    return preset


def _check_write_access(preset: CameraPreset, user: User) -> None:
    """verify user can modify this preset."""
    if user.is_privileged():
        return
    if preset.created_by != user.id or preset.is_default:
        raise DomainError("you can only modify your own presets", status_code=403)
