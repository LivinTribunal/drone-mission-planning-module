from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import CheckConstraint, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class DroneProfile(Base):
    __tablename__ = "drone_profile"

    id = Column(UUID, primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    manufacturer = Column(String)
    model = Column(String)
    max_speed = Column(Float)
    max_climb_rate = Column(Float)
    max_altitude = Column(Float)
    battery_capacity = Column(Float)
    endurance_minutes = Column(Float)
    camera_resolution = Column(String)
    camera_frame_rate = Column(Integer)
    sensor_fov = Column(Float)
    weight = Column(Float)


class Mission(Base):
    __tablename__ = "mission"

    id = Column(UUID, primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    status = Column(
        String(20),
        nullable=False,
        default="DRAFT",
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    airport_id = Column(UUID, ForeignKey("airport.id", ondelete="CASCADE"), nullable=False)
    operator_notes = Column(String)
    drone_profile_id = Column(UUID, ForeignKey("drone_profile.id", ondelete="SET NULL"))
    date_time = Column(DateTime(timezone=True))
    default_speed = Column(Float)
    default_altitude_offset = Column(Float)
    takeoff_coordinate = Column(Geometry("POINTZ", srid=4326))
    landing_coordinate = Column(Geometry("POINTZ", srid=4326))

    airport = relationship("Airport")
    drone_profile = relationship("DroneProfile")
    inspections = relationship("Inspection", back_populates="mission", cascade="all, delete-orphan")
    flight_plan = relationship("FlightPlan", back_populates="mission", uselist=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT', 'PLANNED', 'VALIDATED', 'EXPORTED', 'COMPLETED', 'CANCELLED')",
            name="ck_mission_status",
        ),
    )
