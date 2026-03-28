from uuid import UUID as PyUUID
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.enums import MissionStatus

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

# fields that affect trajectory - changing these invalidates computed trajectory
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
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    airport_id = Column(UUID, ForeignKey("airport.id", ondelete="CASCADE"), nullable=False)
    operator_notes = Column(String)
    drone_profile_id = Column(UUID, ForeignKey("drone_profile.id", ondelete="SET NULL"))
    date_time = Column(DateTime(timezone=True))
    default_speed = Column(Float)
    default_altitude_offset = Column(Float)
    takeoff_coordinate = Column(Geometry("POINTZ", srid=4326))
    landing_coordinate = Column(Geometry("POINTZ", srid=4326))
    has_unsaved_map_changes = Column(Boolean, nullable=False, default=False, server_default="false")

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

    # terminal states - no modifications allowed, user must duplicate
    _TERMINAL = {"EXPORTED", "COMPLETED", "CANCELLED"}

    def invalidate_trajectory(self):
        """regress PLANNED/VALIDATED -> DRAFT when trajectory-affecting data changes.

        bypasses transition_to() because the state machine has no backward
        transitions by design - this is the intentional exception for config changes
        that invalidate the computed trajectory.

        callers must db.delete(mission.flight_plan) before calling this if the
        flight plan needs to be removed from the database - models don't touch sessions.
        """
        if self.status in self._TERMINAL:
            raise ValueError("cannot modify mission after export - duplicate to make changes")
        if self.status in (MissionStatus.PLANNED, MissionStatus.VALIDATED):
            self.status = MissionStatus.DRAFT
            self.flight_plan = None

    def add_inspection(self, inspection):
        """add inspection - invalidates trajectory, blocked after export."""
        self.invalidate_trajectory()
        if len(self.inspections) >= MAX_INSPECTIONS:
            raise ValueError(f"mission already has {MAX_INSPECTIONS} inspections (max limit)")

        inspection.mission_id = self.id
        self.inspections.append(inspection)

    def remove_inspection(self, inspection_id):
        """remove inspection by id - invalidates trajectory, blocked after export."""
        self.invalidate_trajectory()

        target = PyUUID(str(inspection_id))
        for insp in self.inspections:
            if insp.id == target:
                self.inspections.remove(insp)
                return insp

        raise ValueError(f"inspection {inspection_id} not found")

    def change_drone_profile(self, drone_profile_id):
        """change drone profile - invalidates trajectory, blocked after export.

        note: mission_service.update_mission currently handles drone profile
        changes via TRAJECTORY_FIELDS check + invalidate_trajectory() directly,
        bypassing this method. kept as the canonical aggregate-root api for
        programmatic callers and test coverage.
        """
        self.invalidate_trajectory()
        self.drone_profile_id = drone_profile_id
