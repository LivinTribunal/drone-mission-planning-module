from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Session, relationship
from sqlalchemy.sql import func

from app.core.database import Base


class CameraPreset(Base):
    """reusable camera settings preset tied to a drone profile."""

    __tablename__ = "camera_preset"

    id = Column(UUID, primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    drone_profile_id = Column(
        UUID, ForeignKey("drone_profile.id", ondelete="SET NULL"), nullable=True
    )
    created_by = Column(UUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_default = Column(Boolean, default=False, nullable=False)

    # camera fields - same types as InspectionConfiguration
    white_balance = Column(String(20), nullable=True)
    iso = Column(Integer, nullable=True)
    shutter_speed = Column(String(20), nullable=True)
    focus_mode = Column(String(20), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # relationships
    drone_profile = relationship("DroneProfile")
    creator = relationship("User")

    def demote_sibling_defaults(self, db: Session) -> None:
        """enforce one-default-per-drone-profile invariant: clear is_default
        on any other preset in the same bucket (same drone_profile_id, or
        both null for the global bucket). must run before flush when this
        preset's is_default is true.
        """
        query = db.query(CameraPreset).filter(
            CameraPreset.id != self.id,
            CameraPreset.is_default.is_(True),
        )
        if self.drone_profile_id is None:
            query = query.filter(CameraPreset.drone_profile_id.is_(None))
        else:
            query = query.filter(CameraPreset.drone_profile_id == self.drone_profile_id)
        query.update({"is_default": False}, synchronize_session=False)
        db.flush()
