from dataclasses import dataclass, field
from uuid import UUID

from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.flight_plan import ConstraintRule
from app.models.mission import DroneProfile, Mission


@dataclass
class WaypointData:
    """intermediate waypoint before persisting"""

    lon: float
    lat: float
    alt: float
    heading: float = 0.0
    speed: float = 5.0
    waypoint_type: str = "MEASUREMENT"
    camera_action: str = "PHOTO_CAPTURE"
    camera_target: tuple[float, float, float] | None = None
    inspection_id: UUID | None = None
    hover_duration: float | None = None
    gimbal_pitch: float | None = None


@dataclass
class InspectionPass:
    """waypoints from a single inspection"""

    waypoints: list[WaypointData] = field(default_factory=list)
    inspection_id: UUID | None = None


@dataclass
class MissionData:
    # all entities loaded in phase 1 - no further entity queries after this.
    # spatial predicates (ST_Contains, ST_DWithin, ST_Intersects) still use
    # the db session during validation, but these are computational operations
    # on already-loaded geometry data, not entity lookups.

    mission: Mission
    airport: Airport
    drone: DroneProfile | None
    obstacles: list[Obstacle]
    safety_zones: list[SafetyZone]
    surfaces: list[AirfieldSurface]
    constraints: list[ConstraintRule]
    default_speed: float
