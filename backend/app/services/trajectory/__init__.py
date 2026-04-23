"""trajectory generation package - public API re-export surface."""

from .coordinator import generate_trajectory
from .types import LocalObstacle, LocalZone, WaypointData
from .validation import check_obstacle, check_safety_zone, segments_intersect_zone

__all__ = [
    "generate_trajectory",
    "WaypointData",
    "check_obstacle",
    "check_safety_zone",
    "segments_intersect_zone",
    "LocalObstacle",
    "LocalZone",
]
