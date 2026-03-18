from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.enums import CameraAction, WaypointType
from app.models.flight_plan import ConstraintRule
from app.models.mission import DroneProfile, Mission

# type aliases for domain-specific floats
Degrees = float
MetersPerSecond = float
Meters = float
Seconds = float

# trajectory defaults
MIN_ARC_RADIUS: Meters = 350.0
DEFAULT_SWEEP_ANGLE: Degrees = 15.0  # degrees each side of centerline (ZEPHYR manual)
DEFAULT_HORIZONTAL_DISTANCE: Meters = 400.0
MIN_ELEVATION_ANGLE: Degrees = 1.9
MAX_ELEVATION_ANGLE: Degrees = 6.5
DEFAULT_RESERVE_MARGIN = 0.15
HOVER_ANGLE_TOLERANCE: Degrees = 0.05  # 3 arc minutes per ZEPHYR spec
DEFAULT_SPEED: MetersPerSecond = 5.0
DEFAULT_GLIDE_SLOPE: Degrees = 3.0
DEFAULT_HEADING: Degrees = 0.0

# speed/sensor checks
SPEED_FRAMERATE_MARGIN = 0.8
MIN_LHA_FOR_FOV_CHECK = 2
NORTH_BEARING: Degrees = 0.0

# obstacle rerouting
DEFAULT_OBSTACLE_RADIUS: Meters = 15.0
REROUTE_SEARCH_RADIUS_MULTIPLIER = 3.0
MAX_REROUTE_DEVIATION = 0.15
MAX_TURN_ANGLE: Degrees = 60.0

# takeoff/landing safety
TAKEOFF_SAFE_ALTITUDE: Meters = 10.0
LANDING_SAFE_ALTITUDE: Meters = 10.0

# minimum speed floor for duration calculation - prevents division by zero
MIN_SPEED_FLOOR: MetersPerSecond = 0.1

# surface edge node spacing for visibility graph
SURFACE_NODE_SPACING: Meters = 200.0

# runway crossing penalty for transit A*
# penalty per meter of crossing - makes A* prefer routes around runways
# perpendicular crossing (~45m for standard runway) costs 45*10=450m equivalent
# parallel crossing (~3700m for LKPR) costs 3700*10=37000m - strongly avoided
RUNWAY_CROSSING_PENALTY_PER_METER = 10.0

# vertical profile descent detection - ~11m at equator
VERTICAL_POSITION_TOLERANCE_DEG: Degrees = 0.0001

# safety validation
DEFAULT_RUNWAY_BUFFER: Meters = 100.0


@dataclass
class Point3D:
    """3D geographic point (lon, lat, alt in meters)"""

    lon: float
    lat: float
    alt: Meters

    def to_tuple(self) -> tuple[float, float, float]:
        """convert to (lon, lat, alt) tuple for geo utility functions"""
        return (self.lon, self.lat, self.alt)

    @staticmethod
    def from_tuple(t: tuple[float, float, float]) -> Point3D:
        """create from (lon, lat, alt) tuple"""
        return Point3D(lon=t[0], lat=t[1], alt=t[2])

    @staticmethod
    def center(points: list[Point3D]) -> Point3D:
        """arithmetic mean of a list of 3D points"""
        n = len(points)
        if n == 0:
            raise ValueError("no points for center")
        return Point3D(
            lon=sum(p.lon for p in points) / n,
            lat=sum(p.lat for p in points) / n,
            alt=sum(p.alt for p in points) / n,
        )


@dataclass
class Violation:
    """constraint violation from safety validation"""

    is_warning: bool
    message: str
    constraint_id: str | None = None
    waypoint_index: int | None = None


@dataclass
class ResolvedConfig:
    """merged inspection config: operator override > template default > hardcoded"""

    altitude_offset: Meters = 0.0
    speed_override: MetersPerSecond | None = None
    measurement_density: int = 8
    custom_tolerances: dict | None = None
    density: float | None = None
    hover_duration: Seconds | None = None
    horizontal_distance: Meters | None = None
    sweep_angle: Degrees | None = None


@dataclass
class WaypointData:
    """intermediate waypoint before persisting"""

    lon: float
    lat: float
    alt: Meters
    heading: Degrees = 0.0
    speed: MetersPerSecond = 5.0
    waypoint_type: WaypointType = WaypointType.MEASUREMENT
    camera_action: CameraAction = CameraAction.PHOTO_CAPTURE
    camera_target: Point3D | None = None
    inspection_id: UUID | None = None
    hover_duration: Seconds | None = None
    gimbal_pitch: Degrees | None = None


@dataclass
class InspectionPass:
    """waypoints from a single inspection"""

    waypoints: list[WaypointData] = field(default_factory=list)
    inspection_id: UUID | None = None


@dataclass
class MissionData:
    """all entities loaded in phase 1 - no further entity queries after this.
    spatial predicates still use the db session during validation, but these
    are computational operations on already-loaded geometry data."""

    mission: Mission
    airport: Airport
    drone: DroneProfile | None
    obstacles: list[Obstacle]
    safety_zones: list[SafetyZone]
    surfaces: list[AirfieldSurface]
    constraints: list[ConstraintRule]
    default_speed: MetersPerSecond
