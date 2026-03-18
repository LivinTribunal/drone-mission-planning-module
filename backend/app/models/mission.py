from uuid import UUID as PyUUID
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import CheckConstraint, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base

# max inspections per mission
MAX_INSPECTIONS = 10

# status state machine - valid transitions
TRANSITIONS = {
    "DRAFT": ["PLANNED"],
    "PLANNED": ["VALIDATED"],
    "VALIDATED": ["EXPORTED"],
    "EXPORTED": ["COMPLETED", "CANCELLED"],
    "COMPLETED": [],
    "CANCELLED": [],
}

# fields that affect trajectory - changing these regresses VALIDATED -> PLANNED
TRAJECTORY_FIELDS = {
    "drone_profile_id",
    "default_speed",
    "default_altitude_offset",
    "takeoff_coordinate",
    "landing_coordinate",
}


class DroneProfile(Base):
    """drone hardware profile with performance limits."""

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
    """aggregate root - owns inspections and controls status transitions."""

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

    def transition_to(self, target_status: str):
        """enforce status state machine transitions."""
        allowed = TRANSITIONS.get(self.status, [])
        if target_status not in allowed:
            raise ValueError(
                f"cannot transition from {self.status} to {target_status}, allowed: {allowed}"
            )
        self.status = target_status

    def regress_if_validated(self):
        """regress VALIDATED -> PLANNED when trajectory-affecting data changes."""
        if self.status == "VALIDATED":
            self.status = "PLANNED"

    def add_inspection(self, inspection):
        """add inspection - enforces DRAFT-only and max limit."""
        if self.status != "DRAFT":
            raise ValueError("can only add inspections in DRAFT status")
        if len(self.inspections) >= MAX_INSPECTIONS:
            raise ValueError(f"mission already has {MAX_INSPECTIONS} inspections (max limit)")
        inspection.mission_id = self.id
        self.inspections.append(inspection)

    def remove_inspection(self, inspection_id):
        """remove inspection by id - enforces DRAFT-only."""
        if self.status != "DRAFT":
            raise ValueError("can only remove inspections in DRAFT status")
        target = PyUUID(str(inspection_id))
        for insp in self.inspections:
            if insp.id == target:
                self.inspections.remove(insp)
                return insp
        raise ValueError(f"inspection {inspection_id} not found")

    def change_drone_profile(self, drone_profile_id):
        """change drone profile and auto-regress if validated."""
        self.drone_profile_id = drone_profile_id
        self.regress_if_validated()
