from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, CheckConstraint, Column, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class Airport(Base):
    """aggregate root - owns surfaces, obstacles, and safety zones."""

    __tablename__ = "airport"

    id = Column(UUID, primary_key=True, default=uuid4)
    icao_code = Column(String(4), unique=True, nullable=False)
    name = Column(String, nullable=False)
    city = Column(String(100))
    country = Column(String(100))
    elevation = Column(Float, nullable=False)
    location = Column(Geometry("POINTZ", srid=4326), nullable=False)
    default_drone_profile_id = Column(
        UUID, ForeignKey("drone_profile.id", ondelete="SET NULL"), nullable=True
    )

    default_drone_profile = relationship("DroneProfile", foreign_keys=[default_drone_profile_id])

    # terrain source config
    terrain_source = Column(String(20), nullable=False, default="FLAT")
    dem_file_path = Column(String, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "terrain_source IN ('FLAT', 'DEM_UPLOAD', 'DEM_API')",
            name="ck_airport_terrain_source",
        ),
    )

    surfaces = relationship(
        "AirfieldSurface", back_populates="airport", cascade="all, delete-orphan"
    )
    obstacles = relationship("Obstacle", back_populates="airport", cascade="all, delete-orphan")
    safety_zones = relationship(
        "SafetyZone", back_populates="airport", cascade="all, delete-orphan"
    )

    def add_surface(self, surface):
        """add surface to this airport."""
        surface.airport_id = self.id
        self.surfaces.append(surface)

    def add_obstacle(self, obstacle):
        """add obstacle to this airport."""
        obstacle.airport_id = self.id
        self.obstacles.append(obstacle)

    def add_safety_zone(self, zone):
        """add safety zone to this airport."""
        zone.airport_id = self.id
        self.safety_zones.append(zone)


class AirfieldSurface(Base):
    """runway or taxiway surface with geometry."""

    __tablename__ = "airfield_surface"

    id = Column(UUID, primary_key=True, default=uuid4)
    airport_id = Column(UUID, ForeignKey("airport.id", ondelete="CASCADE"), nullable=False)
    identifier = Column(String(10), nullable=False)
    surface_type = Column(String(20), nullable=False)
    geometry = Column(Geometry("LINESTRINGZ", srid=4326), nullable=False)
    boundary = Column(Geometry("POLYGONZ", srid=4326))

    # runway-specific columns
    heading = Column(Float)
    length = Column(Float)
    width = Column(Float)
    threshold_position = Column(Geometry("POINTZ", srid=4326))
    end_position = Column(Geometry("POINTZ", srid=4326))

    airport = relationship("Airport", back_populates="surfaces")
    agls = relationship("AGL", back_populates="surface", cascade="all, delete-orphan")

    __mapper_args__ = {
        "polymorphic_on": surface_type,
    }

    __table_args__ = (
        CheckConstraint(
            "surface_type IN ('RUNWAY', 'TAXIWAY')",
            name="ck_airfield_surface_type",
        ),
    )


class Runway(AirfieldSurface):
    """runway surface subtype."""

    __mapper_args__ = {"polymorphic_identity": "RUNWAY"}


class Taxiway(AirfieldSurface):
    """taxiway surface subtype."""

    __mapper_args__ = {"polymorphic_identity": "TAXIWAY"}


class Obstacle(Base):
    """airport obstacle with 3D geometry."""

    __tablename__ = "obstacle"

    id = Column(UUID, primary_key=True, default=uuid4)
    airport_id = Column(UUID, ForeignKey("airport.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    position = Column(Geometry("POINTZ", srid=4326), nullable=False)
    height = Column(Float, nullable=False)
    radius = Column(Float, nullable=False)
    geometry = Column(Geometry("POLYGONZ", srid=4326), nullable=False)
    type = Column(
        String(20),
        nullable=False,
    )

    airport = relationship("Airport", back_populates="obstacles")

    __table_args__ = (
        CheckConstraint(
            "type IN ('BUILDING', 'TOWER', 'ANTENNA', 'VEGETATION', 'OTHER')",
            name="ck_obstacle_type",
        ),
    )


class SafetyZone(Base):
    """airspace restriction zone with altitude band."""

    __tablename__ = "safety_zone"

    id = Column(UUID, primary_key=True, default=uuid4)
    airport_id = Column(UUID, ForeignKey("airport.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    type = Column(
        String(30),
        nullable=False,
    )
    geometry = Column(Geometry("POLYGONZ", srid=4326), nullable=False)
    altitude_floor = Column(Float)
    altitude_ceiling = Column(Float)
    is_active = Column(Boolean, nullable=False, default=True)

    airport = relationship("Airport", back_populates="safety_zones")

    __table_args__ = (
        CheckConstraint(
            "type IN ('CTR', 'RESTRICTED', 'PROHIBITED', 'TEMPORARY_NO_FLY')",
            name="ck_safety_zone_type",
        ),
    )
