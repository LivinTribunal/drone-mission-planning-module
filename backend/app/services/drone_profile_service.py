import os
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError, NotFoundError
from app.models.mission import DroneProfile, Mission
from app.schemas.drone_profile import DroneProfileCreate, DroneProfileUpdate
from app.services.geometry_converter import apply_schema_update, schema_to_model_data

# custom model upload directory
CUSTOM_MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "static" / "models" / "custom"
ALLOWED_EXTENSIONS = {".glb", ".gltf"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


def list_drones(db: Session) -> list[DroneProfile]:
    """list all drone profiles."""
    return db.query(DroneProfile).all()


def get_mission_counts(db: Session) -> dict[UUID, int]:
    """batch-load mission counts grouped by drone_profile_id."""
    rows = (
        db.query(Mission.drone_profile_id, func.count(Mission.id))
        .group_by(Mission.drone_profile_id)
        .all()
    )
    return dict(rows)


def get_mission_count(db: Session, drone_id: UUID) -> int:
    """get mission count for a single drone profile."""
    return (
        db.query(func.count(Mission.id)).filter(Mission.drone_profile_id == drone_id).scalar() or 0
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

    safe_name = f"custom_{uuid4().hex[:12]}{ext}"
    CUSTOM_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    dest = CUSTOM_MODELS_DIR / safe_name
    dest.write_bytes(file_content)

    drone.model_identifier = safe_name
    db.commit()
    db.refresh(drone)

    return safe_name


def get_drone_model_path(drone_id: UUID, model_identifier: str) -> Path:
    """resolve path to a custom uploaded model file."""
    path = CUSTOM_MODELS_DIR / model_identifier
    if not path.exists():
        raise NotFoundError("model file not found")
    return path
