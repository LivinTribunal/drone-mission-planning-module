from __future__ import annotations

from uuid import UUID as PyUUID
from uuid import uuid4

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Table
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base

# junction tables - no ORM class needed, just a Table for many-to-many with no extra columns
insp_template_targets = Table(
    "insp_template_targets",
    Base.metadata,
    Column(
        "template_id",
        UUID,
        ForeignKey("inspection_template.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "agl_id",
        UUID,
        ForeignKey("agl.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

insp_template_methods = Table(
    "insp_template_methods",
    Base.metadata,
    Column(
        "template_id",
        UUID,
        ForeignKey("inspection_template.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("method", String(30), primary_key=True),
)


class InspectionConfiguration(Base):
    """operator overrides for inspection parameters."""

    __tablename__ = "inspection_configuration"

    id = Column(UUID, primary_key=True, default=uuid4)
    altitude_offset = Column(Float)
    speed_override = Column(Float)
    measurement_density = Column(Integer)
    custom_tolerances = Column(JSONB)
    density = Column(Float)
    hover_duration = Column(Float)  # seconds
    horizontal_distance = Column(Float)
    sweep_angle = Column(Float)
    lha_ids = Column(JSONB)
    capture_mode = Column(String(20), nullable=True)
    recording_setup_duration = Column(Float, nullable=True)
    buffer_distance = Column(Float, nullable=True)

    # config fields that can be overridden per-inspection.
    # lha_ids is included for duplication support (duplicate_mission copies it)
    # but is NOT consumed from ResolvedConfig in the trajectory path -
    # the orchestrator reads inspection.lha_ids directly instead.
    _MERGE_FIELDS = (
        "altitude_offset",
        "speed_override",
        "measurement_density",
        "custom_tolerances",
        "density",
        "hover_duration",
        "horizontal_distance",
        "sweep_angle",
        "lha_ids",
        "capture_mode",
        "recording_setup_duration",
        "buffer_distance",
    )

    def resolve_with_defaults(self, template_config: InspectionConfiguration | None):
        """merge this config over template defaults, returning field dict."""
        merged = {}
        for key in self._MERGE_FIELDS:
            template_val = getattr(template_config, key, None) if template_config else None
            override_val = getattr(self, key, None)

            merged[key] = override_val if override_val is not None else template_val

        return merged


class InspectionTemplate(Base):
    """reusable inspection template with default config and targets."""

    __tablename__ = "inspection_template"

    id = Column(UUID, primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    description = Column(String)
    default_config_id = Column(
        UUID,
        ForeignKey("inspection_configuration.id", ondelete="SET NULL"),
    )
    angular_tolerances = Column(JSONB)
    created_by = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    default_config = relationship("InspectionConfiguration")
    targets = relationship("AGL", secondary=insp_template_targets)


class Inspection(Base):
    """single inspection pass within a mission."""

    __tablename__ = "inspection"

    id = Column(UUID, primary_key=True, default=uuid4)
    mission_id = Column(UUID, ForeignKey("mission.id", ondelete="CASCADE"), nullable=False)
    template_id = Column(UUID, ForeignKey("inspection_template.id"), nullable=False)
    config_id = Column(UUID, ForeignKey("inspection_configuration.id"))
    method = Column(String(30), nullable=False)  # validated at schema level
    sequence_order = Column(Integer, nullable=False)

    mission = relationship("Mission", back_populates="inspections")
    template = relationship("InspectionTemplate")
    config = relationship("InspectionConfiguration")

    @property
    def lha_ids(self) -> list[PyUUID] | None:
        """lha ids from associated config, or none."""
        if self.config and self.config.lha_ids:
            return [PyUUID(s) if isinstance(s, str) else s for s in self.config.lha_ids]
        return None

    def is_speed_compatible_with_frame_rate(
        self, drone_profile, speed: float, path_distance: float = 0.0
    ) -> bool:
        """check if speed is compatible with camera frame rate at measurement density.

        at speed v and frame_rate f, capture spacing is v/f meters.
        speed is compatible when v/f <= waypoint_spacing (= path_distance / (density - 1)).
        """
        if not drone_profile or not drone_profile.camera_frame_rate:
            return True
        if not self.config or not self.config.measurement_density:
            return True

        density = self.config.measurement_density
        if density < 2:
            return True

        if drone_profile.max_speed and speed > drone_profile.max_speed:
            return False

        if path_distance > 0:
            waypoint_spacing = path_distance / (density - 1)
            max_compatible_speed = waypoint_spacing * drone_profile.camera_frame_rate
            if speed > max_compatible_speed:
                return False

        return True
