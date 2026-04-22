from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, CheckConstraint, Column, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.core.exceptions import ConflictError
from app.core.geometry import parse_ewkb
from app.models.enums import ObstacleType, SafetyZoneType
from app.utils.geo import (
    bearing_between,
    linestring_length,
    polygon_oriented_dimensions,
)

# enum values rendered inline into CheckConstraint bodies so schema stays in
# sync when a new member is added to the python enum.
_OBSTACLE_TYPE_VALUES = ", ".join(f"'{m.value}'" for m in ObstacleType)
_SAFETY_ZONE_TYPE_VALUES = ", ".join(f"'{m.value}'" for m in SafetyZoneType)


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
    default_drone_id = Column(
        UUID,
        ForeignKey(
            "drone.id",
            ondelete="SET NULL",
            name="airport_default_drone_id_fkey",
            use_alter=True,
        ),
        nullable=True,
    )

    default_drone = relationship("Drone", foreign_keys=[default_drone_id], post_update=True)

    # multi-tenancy prep - nullable until org logic is implemented
    organization_id = Column(UUID, nullable=True)

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
    drones = relationship(
        "Drone",
        back_populates="airport",
        cascade="all, delete-orphan",
        foreign_keys="Drone.airport_id",
    )

    def add_surface(self, surface):
        """add surface to this airport."""
        surface.airport_id = self.id
        self.surfaces.append(surface)

    def add_obstacle(self, obstacle):
        """add obstacle to this airport."""
        obstacle.airport_id = self.id
        self.obstacles.append(obstacle)

    @property
    def default_drone_profile_id(self):
        """legacy accessor - resolves the template id via the default fleet drone."""
        if self.default_drone is None:
            return None
        return self.default_drone.drone_profile_id

    def add_drone(self, drone):
        """add fleet drone to this airport; enforces (airport, name) uniqueness in memory."""
        if any(d.name == drone.name for d in self.drones):
            raise ConflictError(f"a drone named '{drone.name}' already exists at this airport")
        drone.airport_id = self.id
        self.drones.append(drone)

    def add_safety_zone(self, zone):
        """add safety zone to this airport; enforces max-one airport boundary invariant."""
        if zone.type == SafetyZoneType.AIRPORT_BOUNDARY.value:
            existing = [
                z for z in self.safety_zones if z.type == SafetyZoneType.AIRPORT_BOUNDARY.value
            ]
            if existing:
                raise ConflictError(
                    "Airport boundary already exists. Delete the existing one first."
                )
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
    buffer_distance = Column(Float, nullable=False, default=5.0)

    # runway-specific columns
    heading = Column(Float)
    length = Column(Float)
    width = Column(Float)
    threshold_position = Column(Geometry("POINTZ", srid=4326))
    end_position = Column(Geometry("POINTZ", srid=4326))

    # touchpoint - stored for future video post-processing, runway-only
    touchpoint_latitude = Column(Float, nullable=True)
    touchpoint_longitude = Column(Float, nullable=True)
    touchpoint_altitude = Column(Float, nullable=True)

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

    def recalculate_dimensions(self) -> dict:
        """compute length, width, heading from stored geometry without persisting.

        length and heading derive from the centerline linestring. width derives
        from the boundary polygon's perpendicular OBB axis when available;
        otherwise the existing width is preserved.
        """
        length = self.length
        width = self.width
        heading = self.heading

        # centerline-derived length and heading
        if self.geometry is not None:
            line_geo = parse_ewkb(self.geometry.data)
            line_coords = line_geo.get("coordinates", [])
            if len(line_coords) >= 2:
                length = linestring_length(line_coords)
                start = line_coords[0]
                end = line_coords[-1]
                heading = bearing_between(start[0], start[1], end[0], end[1])

        # boundary-derived width via OBB perpendicular to centerline
        if self.boundary is not None:
            poly_geo = parse_ewkb(self.boundary.data)
            rings = poly_geo.get("coordinates", [])
            if rings:
                obb_length, obb_width, _ = polygon_oriented_dimensions(rings[0])
                if obb_width > 0:
                    width = obb_width
                if length is None and obb_length > 0:
                    length = obb_length

        return {
            "length": length,
            "width": width,
            "heading": heading,
        }


class Runway(AirfieldSurface):
    """runway surface subtype."""

    __mapper_args__ = {"polymorphic_identity": "RUNWAY"}


class Taxiway(AirfieldSurface):
    """taxiway surface subtype."""

    __mapper_args__ = {"polymorphic_identity": "TAXIWAY"}


class Obstacle(Base):
    """airport obstacle with polygon boundary and buffer distance.

    boundary z-coordinates are ground-level base altitude (MSL) - normalized
    to terrain elevation at creation time. height is the vertical extent
    above that base. obstacle top = min(boundary z) + height.
    """

    __tablename__ = "obstacle"

    id = Column(UUID, primary_key=True, default=uuid4)
    airport_id = Column(UUID, ForeignKey("airport.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    height = Column(Float, nullable=False)
    boundary = Column("geometry", Geometry("POLYGONZ", srid=4326), nullable=False)
    position = Column(Geometry("POINTZ", srid=4326), nullable=True)
    radius = Column(Float, nullable=True)
    buffer_distance = Column(Float, nullable=False, default=5.0)
    type = Column(
        String(20),
        nullable=False,
    )

    airport = relationship("Airport", back_populates="obstacles")

    __table_args__ = (
        CheckConstraint(
            f"type IN ({_OBSTACLE_TYPE_VALUES})",
            name="ck_obstacle_type",
        ),
    )

    @staticmethod
    def centroid_from_boundary_ring(ring: list) -> tuple[float, float, float]:
        """compute centroid (lon, lat, z) from a polygon boundary ring."""
        lons = [c[0] for c in ring]
        lats = [c[1] for c in ring]
        z = ring[0][2] if len(ring[0]) >= 3 else 0.0
        return sum(lons) / len(lons), sum(lats) / len(lats), z

    def recalculate_dimensions(self) -> dict:
        """compute length, width, heading from the stored polygon boundary.

        derives an oriented bounding box from the boundary's outer ring.
        radius is half of the smaller OBB axis (useful for circular-ish obstacles).
        """
        length = 0.0
        width = 0.0
        heading = 0.0

        if self.boundary is not None:
            poly_geo = parse_ewkb(self.boundary.data)
            rings = poly_geo.get("coordinates", [])
            if rings:
                length, width, heading = polygon_oriented_dimensions(rings[0])

        radius = width / 2.0 if width > 0 else 0.0

        return {
            "length": length,
            "width": width,
            "heading": heading,
            "radius": radius,
        }


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
            f"type IN ({_SAFETY_ZONE_TYPE_VALUES})",
            name="ck_safety_zone_type",
        ),
    )
