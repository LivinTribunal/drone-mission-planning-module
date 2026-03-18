from datetime import datetime, timezone
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


class FlightPlan(Base):
    """generated flight plan with waypoints and validation."""

    __tablename__ = "flight_plan"

    id = Column(UUID, primary_key=True, default=uuid4)
    mission_id = Column(
        UUID,
        ForeignKey("mission.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    airport_id = Column(UUID, ForeignKey("airport.id"), nullable=False)
    total_distance = Column(Float)
    estimated_duration = Column(Float)
    # TODO: set when validation endpoint is implemented
    is_validated = Column(Boolean, nullable=False, default=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

    mission = relationship("Mission", back_populates="flight_plan")
    airport = relationship("Airport")
    waypoints = relationship(
        "Waypoint",
        back_populates="flight_plan",
        cascade="all, delete-orphan",
        order_by="Waypoint.sequence_order",
    )
    validation_result = relationship(
        "ValidationResult",
        back_populates="flight_plan",
        uselist=False,
        cascade="all, delete-orphan",
    )
    export_results = relationship(
        "ExportResult", back_populates="flight_plan", cascade="all, delete-orphan"
    )
    constraints = relationship(
        "ConstraintRule", back_populates="flight_plan", cascade="all, delete-orphan"
    )

    def compile(self, total_distance: float, estimated_duration: float):
        """set computed flight plan metrics and timestamp."""
        if total_distance < 0:
            raise ValueError(f"total_distance must be non-negative, got {total_distance}")
        if estimated_duration < 0:
            raise ValueError(f"estimated_duration must be non-negative, got {estimated_duration}")
        self.total_distance = total_distance
        self.estimated_duration = estimated_duration
        self.generated_at = datetime.now(timezone.utc)


class Waypoint(Base):
    """single waypoint in a flight plan."""

    __tablename__ = "waypoint"

    id = Column(UUID, primary_key=True, default=uuid4)
    flight_plan_id = Column(UUID, ForeignKey("flight_plan.id", ondelete="CASCADE"), nullable=False)
    inspection_id = Column(UUID, ForeignKey("inspection.id", ondelete="SET NULL"))
    sequence_order = Column(Integer, nullable=False)
    position = Column(Geometry("POINTZ", srid=4326), nullable=False)
    heading = Column(Float)
    speed = Column(Float)
    hover_duration = Column(Float)
    camera_action = Column(String(20))
    waypoint_type = Column(String(20), nullable=False)
    camera_target = Column(Geometry("POINTZ", srid=4326))
    gimbal_pitch = Column(Float)

    flight_plan = relationship("FlightPlan", back_populates="waypoints")
    inspection = relationship("Inspection")

    __table_args__ = (
        CheckConstraint(
            "camera_action IN ('NONE', 'PHOTO_CAPTURE', 'RECORDING_START', 'RECORDING_STOP')",
            name="ck_waypoint_camera_action",
        ),
        CheckConstraint(
            "waypoint_type IN ('TAKEOFF', 'TRANSIT', 'MEASUREMENT', 'HOVER', 'LANDING')",
            name="ck_waypoint_type",
        ),
    )


class ValidationResult(Base):
    """result of safety validation for a flight plan."""

    __tablename__ = "validation_result"

    id = Column(UUID, primary_key=True, default=uuid4)
    flight_plan_id = Column(
        UUID, ForeignKey("flight_plan.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    passed = Column(Boolean, nullable=False)
    validated_at = Column(DateTime(timezone=True), server_default=func.now())

    flight_plan = relationship("FlightPlan", back_populates="validation_result")
    violations = relationship(
        "ValidationViolation", back_populates="validation_result", cascade="all, delete-orphan"
    )


class ValidationViolation(Base):
    """individual validation violation or warning."""

    __tablename__ = "validation_violation"

    id = Column(UUID, primary_key=True, default=uuid4)
    validation_result_id = Column(
        UUID, ForeignKey("validation_result.id", ondelete="CASCADE"), nullable=False
    )
    constraint_id = Column(UUID, ForeignKey("constraint_rule.id", ondelete="SET NULL"))
    is_warning = Column(Boolean, nullable=False, default=False)
    message = Column(String, nullable=False)

    validation_result = relationship("ValidationResult", back_populates="violations")
    constraint = relationship("ConstraintRule")


class ExportResult(Base):
    """exported flight plan file record."""

    __tablename__ = "export_result"

    id = Column(UUID, primary_key=True, default=uuid4)
    flight_plan_id = Column(UUID, ForeignKey("flight_plan.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String, nullable=False)
    format = Column(String(10), nullable=False)
    file_path = Column(String, nullable=False)
    exported_at = Column(DateTime(timezone=True), server_default=func.now())

    flight_plan = relationship("FlightPlan", back_populates="export_results")

    __table_args__ = (
        CheckConstraint(
            "format IN ('MAVLINK', 'KML', 'KMZ', 'JSON')",
            name="ck_export_format",
        ),
    )


class ConstraintRule(Base):
    """flight constraint rule with type-specific parameters."""

    __tablename__ = "constraint_rule"

    id = Column(UUID, primary_key=True, default=uuid4)
    flight_plan_id = Column(UUID, ForeignKey("flight_plan.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    constraint_type = Column(String(30), nullable=False)
    is_hard_constraint = Column(Boolean, nullable=False, default=True)

    # altitude constraint
    min_altitude = Column(Float)
    max_altitude = Column(Float)

    # speed constraint
    max_horizontal_speed = Column(Float)
    max_vertical_speed = Column(Float)

    # battery constraint
    max_flight_time = Column(Float)
    reserve_margin = Column(Float)

    # runway buffer constraint
    lateral_buffer = Column(Float)
    longitudinal_buffer = Column(Float)

    # geofence constraint
    boundary = Column(Geometry("POLYGONZ", srid=4326))

    flight_plan = relationship("FlightPlan", back_populates="constraints")

    __mapper_args__ = {
        "polymorphic_on": constraint_type,
        "polymorphic_identity": "CONSTRAINT",
    }


class AltitudeConstraint(ConstraintRule):
    __mapper_args__ = {"polymorphic_identity": "ALTITUDE"}


class SpeedConstraint(ConstraintRule):
    __mapper_args__ = {"polymorphic_identity": "SPEED"}


class BatteryConstraint(ConstraintRule):
    __mapper_args__ = {"polymorphic_identity": "BATTERY"}


class RunwayBufferConstraint(ConstraintRule):
    __mapper_args__ = {"polymorphic_identity": "RUNWAY_BUFFER"}


class GeofenceConstraint(ConstraintRule):
    __mapper_args__ = {"polymorphic_identity": "GEOFENCE"}
