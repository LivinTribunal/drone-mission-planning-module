"""validation subpackage - re-exports everything importable from the old safety_validator."""

from .altitude import _batch_check_minimum_agl
from .constraints import _check_constraint, _violation
from .drone import check_battery, check_drone_constraints
from .obstacles import _batch_check_obstacles, check_obstacle, segments_intersect_obstacle
from .orchestrator import validate_inspection_pass
from .runway import _check_runway_buffer, segment_runway_crossing_length
from .zones import (
    _batch_check_boundary_zones,
    _batch_check_zones,
    check_safety_zone,
    segments_intersect_zone,
)

__all__ = [
    "validate_inspection_pass",
    "_batch_check_obstacles",
    "_batch_check_zones",
    "_batch_check_boundary_zones",
    "_batch_check_minimum_agl",
    "check_drone_constraints",
    "check_obstacle",
    "check_battery",
    "check_safety_zone",
    "segments_intersect_obstacle",
    "segments_intersect_zone",
    "segment_runway_crossing_length",
    "_check_constraint",
    "_check_runway_buffer",
    "_violation",
]
