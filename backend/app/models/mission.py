from datetime import datetime, timezone
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
from app.models.enums import ComputationStatus, MissionStatus

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
    "measurement_speed_override",
    "default_altitude_offset",
    "takeoff_coordinate",
    "landing_coordinate",
    "default_capture_mode",
    "default_buffer_distance",
    "transit_agl",
    "require_perpendicular_runway_crossing",
    "flight_plan_scope",
}

# minimum allowable cruise altitude (AGL meters) - kept in sync with
# app.services.trajectory_types.MINIMUM_ALTITUDE_THRESHOLD to avoid a
# schema->services import from validators.
MIN_TRANSIT_ALTITUDE_AGL = 5.0


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
    model_identifier = Column(String, nullable=True)
    max_optical_zoom = Column(Float, nullable=True)
    # whether this airframe can receive embedded geofence polygons at upload time
    # (e.g. ArduPilot/PX4 mavlink fences). consumer DJI = False; pilot 2 / fh2
    # route the keep-outs out-of-band so the file-level capability is False here.
    supports_geozone_upload = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


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
    measurement_speed_override = Column(Float, nullable=True)
    default_altitude_offset = Column(Float)
    takeoff_coordinate = Column(Geometry("POINTZ", srid=4326))
    landing_coordinate = Column(Geometry("POINTZ", srid=4326))
    default_capture_mode = Column(String(20), nullable=True, default="VIDEO_CAPTURE")
    default_buffer_distance = Column(Float, nullable=True)

    # mission-level camera defaults - inspection overrides take precedence
    camera_mode = Column(String(10), nullable=False, default="AUTO", server_default="AUTO")
    default_white_balance = Column(String(20), nullable=True)
    default_iso = Column(Integer, nullable=True)
    default_shutter_speed = Column(String(20), nullable=True)
    default_focus_mode = Column(String(20), nullable=True)

    transit_agl = Column(Float, nullable=True)
    require_perpendicular_runway_crossing = Column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    flight_plan_scope = Column(String(25), nullable=False, default="FULL", server_default="FULL")
    has_unsaved_map_changes = Column(Boolean, nullable=False, default=False, server_default="false")

    # trajectory computation lifecycle
    computation_status = Column(String(20), nullable=False, default="IDLE", server_default="IDLE")
    computation_error = Column(String, nullable=True)
    computation_started_at = Column(DateTime(timezone=True), nullable=True)

    airport = relationship("Airport")
    drone_profile = relationship("DroneProfile")
    inspections = relationship("Inspection", back_populates="mission", cascade="all, delete-orphan")
    flight_plan = relationship("FlightPlan", back_populates="mission", uselist=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT', 'PLANNED', 'VALIDATED', 'EXPORTED', 'COMPLETED', 'CANCELLED')",
            name="ck_mission_status",
        ),
        CheckConstraint(
            "flight_plan_scope IN ('FULL', 'NO_TAKEOFF_LANDING', 'MEASUREMENTS_ONLY')",
            name="ck_mission_flight_plan_scope",
        ),
        CheckConstraint(
            "computation_status IN ('IDLE', 'COMPUTING', 'COMPLETED', 'FAILED')",
            name="ck_mission_computation_status",
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
    _TERMINAL = {"COMPLETED", "CANCELLED"}

    def regress_to_planned(self):
        """regress VALIDATED/EXPORTED -> PLANNED when waypoints are modified in place.

        bypasses transition_to() because the state machine has no backward
        transitions by design - this is the intentional exception for waypoint
        edits that don't invalidate the full trajectory but do invalidate validation.
        """
        if self.status in self._TERMINAL:
            raise ValueError("cannot modify mission in completed or cancelled state")
        if self.status in (MissionStatus.VALIDATED, MissionStatus.EXPORTED):
            self.status = MissionStatus.PLANNED

    def invalidate_trajectory(self):
        """regress PLANNED/VALIDATED/EXPORTED -> DRAFT when trajectory-affecting data changes.

        bypasses transition_to() because the state machine has no backward
        transitions by design - this is the intentional exception for config changes
        that invalidate the computed trajectory.

        callers must db.delete(mission.flight_plan) before calling this if the
        flight plan needs to be removed from the database - models don't touch sessions.
        """
        if self.status in self._TERMINAL:
            raise ValueError("cannot modify mission in completed or cancelled state")
        if self.status in (
            MissionStatus.PLANNED,
            MissionStatus.VALIDATED,
            MissionStatus.EXPORTED,
        ):
            self.status = MissionStatus.DRAFT
            self.flight_plan = None
        self.reset_computation_status()

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

    def mark_computing(self):
        """set computation status to COMPUTING with timestamp."""
        self.computation_status = ComputationStatus.COMPUTING
        self.computation_error = None
        self.computation_started_at = datetime.now(timezone.utc)

    def mark_computation_completed(self):
        """set computation status to COMPLETED after successful generation."""
        self.computation_status = ComputationStatus.COMPLETED
        self.computation_error = None
        self.computation_started_at = None

    def mark_computation_failed(self, error: str):
        """set computation status to FAILED with error message."""
        self.computation_status = ComputationStatus.FAILED
        self.computation_error = error
        self.computation_started_at = None

    def resolve_staleness(self, timeout_minutes: int = 5) -> bool:
        """check if a COMPUTING state is stale and mark as failed if so.

        returns true if status was stale and changed to FAILED.
        """
        if self.computation_status != ComputationStatus.COMPUTING:
            return False
        if self.computation_started_at is None:
            return False

        started = self.computation_started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        if elapsed > timeout_minutes * 60:
            self.mark_computation_failed("computation timed out")
            return True
        return False

    def reset_computation_status(self):
        """reset computation status to IDLE."""
        self.computation_status = ComputationStatus.IDLE
        self.computation_error = None
        self.computation_started_at = None

    def validate_transit_altitude(self, drone: "DroneProfile | None" = None):
        """enforce transit altitude business rules.

        rules: positive, >= MIN_TRANSIT_ALTITUDE_AGL, <= drone max altitude
        when a drone profile is attached. raises ValueError on failure; no-op
        when the field is not set.
        """
        value = self.transit_agl
        if value is None:
            return

        if value <= 0:
            raise ValueError("transit_agl must be greater than 0")
        if value < MIN_TRANSIT_ALTITUDE_AGL:
            raise ValueError(f"transit_agl must be at least {MIN_TRANSIT_ALTITUDE_AGL:.0f}m AGL")
        if drone and drone.max_altitude is not None and value > drone.max_altitude:
            raise ValueError(
                f"transit_agl {value:.0f}m exceeds drone max altitude {drone.max_altitude:.0f}m"
            )
