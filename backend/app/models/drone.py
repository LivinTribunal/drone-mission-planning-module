from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Drone(Base):
    """airport-scoped fleet unit referencing a shared DroneProfile template."""

    __tablename__ = "drone"

    id = Column(UUID, primary_key=True, default=uuid4)
    airport_id = Column(UUID, ForeignKey("airport.id", ondelete="RESTRICT"), nullable=False)
    drone_profile_id = Column(
        UUID, ForeignKey("drone_profile.id", ondelete="RESTRICT"), nullable=False
    )
    name = Column(String, nullable=False)
    serial_number = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    airport = relationship("Airport", back_populates="drones", foreign_keys=[airport_id])
    drone_profile = relationship("DroneProfile", back_populates="drones")

    __table_args__ = (UniqueConstraint("airport_id", "name", name="uq_drone_airport_name"),)
