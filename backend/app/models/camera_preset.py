from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
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
    focus_distance_m = Column(Float, nullable=True)
    optical_zoom = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # relationships
    drone_profile = relationship("DroneProfile")
    creator = relationship("User")
