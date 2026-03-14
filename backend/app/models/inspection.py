from uuid import uuid4

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Table
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base

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
    __tablename__ = "inspection_configuration"

    id = Column(UUID, primary_key=True, default=uuid4)
    altitude_offset = Column(Float)
    speed_override = Column(Float)
    measurement_density = Column(Integer)
    custom_tolerances = Column(JSONB)
    density = Column(Float)


class InspectionTemplate(Base):
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

    default_config = relationship("InspectionConfiguration")
    targets = relationship("AGL", secondary=insp_template_targets)


class Inspection(Base):
    __tablename__ = "inspection"

    id = Column(UUID, primary_key=True, default=uuid4)
    mission_id = Column(UUID, ForeignKey("mission.id", ondelete="CASCADE"), nullable=False)
    template_id = Column(UUID, ForeignKey("inspection_template.id"), nullable=False)
    config_id = Column(UUID, ForeignKey("inspection_configuration.id"))
    method = Column(String(30), nullable=False)
    sequence_order = Column(Integer, nullable=False)

    mission = relationship("Mission", back_populates="inspections")
    template = relationship("InspectionTemplate")
    config = relationship("InspectionConfiguration")
