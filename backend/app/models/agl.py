import logging
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import CheckConstraint, Column, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base

logger = logging.getLogger(__name__)


class AGL(Base):
    """approach guidance light group with child LHA units."""

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

    def calculate_lha_center_point(self) -> tuple[float, float, float]:
        """compute centroid (lon, lat, alt) of all LHA positions."""
        from app.schemas.geometry import parse_ewkb

        if not self.lhas:
            raise ValueError("no LHA units to compute center from")

        lons, lats, alts = [], [], []
        for lha in self.lhas:
            try:
                coords = parse_ewkb(lha.position.data).get("coordinates")
                if not coords or len(coords) < 3:
                    continue
            except Exception as e:
                logger.warning("failed to parse LHA position for lha %s: %s", lha.id, e)
                continue
            lons.append(coords[0])
            lats.append(coords[1])
            alts.append(coords[2])

        if not lons:
            raise ValueError("no valid LHA positions to compute center from")

        n = len(lons)
        return (sum(lons) / n, sum(lats) / n, sum(alts) / n)


class LHA(Base):
    """light housing assembly - individual light unit within an AGL.

    position.z is normalized to ground elevation at write time (same as obstacles).
    the trajectory engine reads this value directly - no elevation provider override needed.
    """

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
    position = Column(Geometry("POINTZ", srid=4326), nullable=False)  # normalized ground elevation

    agl = relationship("AGL", back_populates="lhas")

    __table_args__ = (
        CheckConstraint(
            "lamp_type IN ('HALOGEN', 'LED')",
            name="ck_lha_lamp_type",
        ),
    )
