import os
import re
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError, NotFoundError
from app.models.drone import Drone
from app.models.mission import DroneProfile, Mission
from app.schemas.drone_profile import DroneProfileCreate, DroneProfileUpdate
from app.services.geometry_converter import apply_schema_update, schema_to_model_data

# custom model upload directory
CUSTOM_MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "static" / "models" / "custom"
ALLOWED_EXTENSIONS = {".glb", ".gltf"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
SAFE_IDENTIFIER_RE = re.compile(r"^[a-zA-Z0-9_\-]+(\.[a-zA-Z0-9]+)?$")


def list_drones(db: Session) -> list[DroneProfile]:
    """list all drone profiles."""
    return db.query(DroneProfile).all()


def get_mission_counts(db: Session) -> dict[UUID, int]:
    """batch-load mission counts grouped by template drone_profile_id via fleet."""
    rows = (
        db.query(Drone.drone_profile_id, func.count(Mission.id))
        .join(Mission, Mission.drone_id == Drone.id)
        .group_by(Drone.drone_profile_id)
        .all()
    )
    return dict(rows)


def get_mission_count(db: Session, drone_profile_id: UUID) -> int:
    """get mission count across fleet drones backed by a template."""
    return (
        db.query(func.count(Mission.id))
        .join(Drone, Mission.drone_id == Drone.id)
        .filter(Drone.drone_profile_id == drone_profile_id)
        .scalar()
        or 0
    )


def get_drone_counts(db: Session) -> dict[UUID, int]:
    """batch-load fleet drone counts grouped by profile id."""
    rows = (
        db.query(Drone.drone_profile_id, func.count(Drone.id))
        .group_by(Drone.drone_profile_id)
        .all()
    )
    return dict(rows)


def get_drone_count(db: Session, drone_profile_id: UUID) -> int:
    """count fleet drones backed by a given template."""
    return (
        db.query(func.count(Drone.id)).filter(Drone.drone_profile_id == drone_profile_id).scalar()
        or 0
    )


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
    """delete drone profile template; returns warnings for dependent fleet drones."""
    drone = db.query(DroneProfile).filter(DroneProfile.id == drone_id).first()
    if not drone:
        raise NotFoundError("drone profile not found")

    # fleet FK is RESTRICT so we surface dependencies instead of silent failure
    fleet = db.query(Drone).filter(Drone.drone_profile_id == drone_id).all()
    if fleet:
        names = ", ".join(d.name for d in fleet)
        raise DomainError(
            f"cannot delete template - fleet drones still reference it: {names}",
            status_code=409,
        )

    db.delete(drone)
    db.commit()

    return []


def upload_drone_model(db: Session, drone_id: UUID, file_content: bytes, filename: str) -> str:
    """upload a custom 3d model for a drone profile."""
    drone = db.query(DroneProfile).filter(DroneProfile.id == drone_id).first()
    if not drone:
        raise NotFoundError("drone profile not found")

    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise DomainError("only .glb and .gltf files are supported")

    if len(file_content) > MAX_FILE_SIZE:
        raise DomainError("file exceeds maximum size of 20MB")

    # delete previous custom model file if it exists
    old_id = drone.model_identifier
    if old_id and old_id.startswith("custom_"):
        old_path = CUSTOM_MODELS_DIR / old_id
        if old_path.exists() and old_path.resolve().is_relative_to(CUSTOM_MODELS_DIR.resolve()):
            old_path.unlink()

    safe_name = f"custom_{uuid4().hex[:12]}{ext}"
    CUSTOM_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    dest = CUSTOM_MODELS_DIR / safe_name
    dest.write_bytes(file_content)

    try:
        drone.model_identifier = safe_name
        db.commit()
        db.refresh(drone)
    except Exception:
        if dest.exists():
            dest.unlink()
        raise

    return safe_name


def validate_model_identifier(identifier: str) -> None:
    """validate that a model identifier contains only safe characters."""
    if not SAFE_IDENTIFIER_RE.match(identifier):
        raise DomainError("invalid model identifier - only alphanumeric, underscore, dash allowed")


def get_drone_model_path(drone_id: UUID, model_identifier: str) -> Path:
    """resolve path to a custom uploaded model file."""
    validate_model_identifier(model_identifier)
    path = CUSTOM_MODELS_DIR / model_identifier

    # path traversal guard
    if not path.resolve().is_relative_to(CUSTOM_MODELS_DIR.resolve()):
        raise NotFoundError("model file not found")

    if not path.exists():
        raise NotFoundError("model file not found")
    return path
