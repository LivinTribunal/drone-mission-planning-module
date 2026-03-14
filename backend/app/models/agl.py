from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import CheckConstraint, Column, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class AGL(Base):
    __tablename__ = "agl"

    id = Column(UUID, primary_key=True, default=uuid4)
    surface_id = Column(UUID, ForeignKey("airfield_surface.id", ondelete="CASCADE"), nullable=False)
    agl_type = Column(String(30), nullable=False)
    name = Column(String, nullable=False)
    position = Column(Geometry("POINTZ", srid=4326), nullable=False)
    side = Column(String(10))
    glide_slope_angle = Column(Float)
    distance_from_threshold = Column(Float)
    offset_from_centerline = Column(Float)

    surface = relationship("AirfieldSurface", back_populates="agls")
    lhas = relationship("LHA", back_populates="agl", cascade="all, delete-orphan")


class LHA(Base):
    __tablename__ = "lha"

    id = Column(UUID, primary_key=True, default=uuid4)
    agl_id = Column(UUID, ForeignKey("agl.id", ondelete="CASCADE"), nullable=False)
    unit_number = Column(Integer, nullable=False)
    setting_angle = Column(Float, nullable=False)
    transition_sector_width = Column(Float)
    lamp_type = Column(
        String(10),
        nullable=False,
    )
    position = Column(Geometry("POINTZ", srid=4326), nullable=False)

    agl = relationship("AGL", back_populates="lhas")

    __table_args__ = (
        CheckConstraint(
            "lamp_type IN ('HALOGEN', 'LED')",
            name="ck_lha_lamp_type",
        ),
    )
