from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError, NotFoundError
from app.models.camera_preset import CameraPreset
from app.models.inspection import InspectionConfiguration
from app.models.user import User
from app.schemas.camera_preset import CameraPresetCreate, CameraPresetUpdate
from app.services.geometry_converter import apply_schema_update, schema_to_model_data

_PRIVILEGED_ROLES = ("COORDINATOR", "SUPER_ADMIN")


def list_presets(
    db: Session,
    user: User,
    drone_profile_id: UUID | None = None,
    is_default: bool | None = None,
) -> list[CameraPreset]:
    """list presets visible to user: defaults + own presets."""
    query = db.query(CameraPreset)
    if user.role not in _PRIVILEGED_ROLES:
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
    """fetch preset by id, ignoring visibility - callers needing the
    operator-visible view should use get_preset_for_user.
    """
    preset = db.query(CameraPreset).filter(CameraPreset.id == preset_id).first()
    if not preset:
        raise NotFoundError("camera preset not found")
    return preset


def get_preset_for_user(db: Session, preset_id: UUID, user: User) -> CameraPreset:
    """fetch preset enforcing visibility: non-privileged users can only see
    default presets or their own. hides non-visible presets as 404, not 403.
    """
    preset = get_preset(db, preset_id)
    if user.role in _PRIVILEGED_ROLES:
        return preset
    if preset.is_default or preset.created_by == user.id:
        return preset
    raise NotFoundError("camera preset not found")


def create_preset(db: Session, schema: CameraPresetCreate, user: User) -> CameraPreset:
    """create camera preset. only privileged users may set is_default=true."""
    if schema.is_default and user.role not in _PRIVILEGED_ROLES:
        raise DomainError("only coordinators can create default presets", status_code=403)

    data = schema_to_model_data(schema)
    data["created_by"] = user.id
    preset = CameraPreset(**data)
    # demote any existing default for this bucket BEFORE insert so the
    # partial unique index (one default per drone_profile) is never violated
    if preset.is_default:
        _clear_other_defaults(db, preset)
    db.add(preset)
    db.flush()
    db.refresh(preset)
    return preset


def update_preset(
    db: Session, preset_id: UUID, schema: CameraPresetUpdate, user: User
) -> CameraPreset:
    """update camera preset. enforces ownership and is_default privilege."""
    if schema.is_default and user.role not in _PRIVILEGED_ROLES:
        raise DomainError("only coordinators can set default presets", status_code=403)

    preset = get_preset(db, preset_id)
    _check_write_access(preset, user)
    apply_schema_update(preset, schema)
    # demote sibling defaults BEFORE flushing the update so the partial unique
    # index can't observe two rows with is_default=true simultaneously
    if preset.is_default:
        _clear_other_defaults(db, preset)
    db.flush()
    db.refresh(preset)
    return preset


def delete_preset(db: Session, preset_id: UUID, user: User) -> CameraPreset:
    """delete camera preset, nullifying inspection references. flushes; the
    caller (route) owns the commit.
    """
    preset = get_preset(db, preset_id)
    _check_write_access(preset, user)

    db.query(InspectionConfiguration).filter(
        InspectionConfiguration.camera_preset_id == preset.id
    ).update({"camera_preset_id": None}, synchronize_session=False)

    db.delete(preset)
    db.flush()
    return preset


def _clear_other_defaults(db: Session, preset: CameraPreset) -> None:
    """ensure at most one is_default preset per drone profile."""
    query = db.query(CameraPreset).filter(
        CameraPreset.id != preset.id,
        CameraPreset.is_default.is_(True),
    )
    if preset.drone_profile_id is None:
        query = query.filter(CameraPreset.drone_profile_id.is_(None))
    else:
        query = query.filter(CameraPreset.drone_profile_id == preset.drone_profile_id)
    query.update({"is_default": False}, synchronize_session=False)
    db.flush()


def _check_write_access(preset: CameraPreset, user: User) -> None:
    """verify user can modify this preset."""
    if user.role in _PRIVILEGED_ROLES:
        return
    if preset.created_by != user.id or preset.is_default:
        raise DomainError("you can only modify your own presets", status_code=403)
