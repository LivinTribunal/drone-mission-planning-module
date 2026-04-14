from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING
from uuid import UUID

from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.enums import CameraAction, SafetyZoneType, WaypointType
from app.models.flight_plan import ConstraintRule
from app.models.mission import DroneProfile, Mission

if TYPE_CHECKING:
    from app.services.elevation_provider import ElevationProvider

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

# fly-over defaults
DEFAULT_FLY_OVER_HEIGHT: Meters = 15.0
DEFAULT_FLY_OVER_SPEED: MetersPerSecond = 5.0
DEFAULT_FLY_OVER_GIMBAL: Degrees = -90.0

# parallel-side-sweep defaults
DEFAULT_PARALLEL_OFFSET: Meters = 30.0
DEFAULT_PARALLEL_HEIGHT: Meters = 10.0
DEFAULT_PARALLEL_SPEED: MetersPerSecond = 3.0

# hover-point-lock defaults (ZEPHYR manual fallback)
DEFAULT_HOVER_DISTANCE_PAPI: Meters = 50.0
DEFAULT_HOVER_DISTANCE_RUNWAY: Meters = 10.0
DEFAULT_HOVER_HEIGHT: Meters = 5.0
DEFAULT_HOVER_DURATION: Seconds = 10.0

# speed/sensor checks
SPEED_FRAMERATE_MARGIN = 0.8
MIN_LHA_FOR_FOV_CHECK = 2
NORTH_BEARING: Degrees = 0.0

# obstacle rerouting
DEFAULT_OBSTACLE_RADIUS: Meters = 15.0
REROUTE_SEARCH_RADIUS_MULTIPLIER = 3.0
MAX_REROUTE_DEVIATION = 0.15
MAX_TURN_ANGLE: Degrees = 60.0

# minimum speed floor for duration calculation - prevents division by zero
MIN_SPEED_FLOOR: MetersPerSecond = 0.1
assert MIN_SPEED_FLOOR > 0, "MIN_SPEED_FLOOR must be positive to prevent division by zero"

# surface edge node spacing for visibility graph
SURFACE_NODE_SPACING: Meters = 200.0

# runway crossing penalty for transit A*
# penalty per meter of crossing - makes A* prefer routes around runways
# perpendicular crossing (~45m for standard runway) costs 45*10=450m equivalent
# parallel crossing (~3700m for LKPR) costs 3700*10=37000m - strongly avoided
RUNWAY_CROSSING_PENALTY_PER_METER = 10.0

# vertical profile descent detection - ~11m at equator
VERTICAL_POSITION_TOLERANCE_DEG: Degrees = 0.0001

# terrain following
MINIMUM_ALTITUDE_THRESHOLD: Meters = 5.0
TRANSIT_AGL: Meters = 30.0

# safety validation
DEFAULT_RUNWAY_BUFFER: Meters = 100.0
HARD_ZONE_TYPES = (SafetyZoneType.PROHIBITED, SafetyZoneType.TEMPORARY_NO_FLY)


@dataclass
class Point3D:
    """3D geographic point (lon, lat, alt in meters MSL)."""

    lon: float
    lat: float
    alt: Meters  # meters above mean sea level

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
    violation_kind: str | None = None
    constraint_id: str | None = None
    waypoint_index: int | None = None


@dataclass
class ResolvedConfig:
    """merged inspection config: operator override > template default > hardcoded"""

    altitude_offset: Meters = 0.0
    speed_override: MetersPerSecond | None = None
    measurement_density: int = 8
    custom_tolerances: dict | None = None
    hover_duration: Seconds | None = None
    horizontal_distance: Meters | None = None
    sweep_angle: Degrees | None = None
    vertical_profile_height: Meters | None = None
    capture_mode: str = "VIDEO_CAPTURE"
    recording_setup_duration: Seconds = 5.0
    buffer_distance: Meters = 5.0
    # method-specific fields
    height_above_lights: Meters | None = None
    lateral_offset: Meters | None = None
    distance_from_lha: Meters | None = None
    height_above_lha: Meters | None = None
    camera_gimbal_angle: Degrees | None = None
    selected_lha_id: UUID | str | None = None
    hover_bearing: Degrees | None = None
    hover_bearing_reference: str | None = None


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
    elevation_provider: ElevationProvider | None = None
