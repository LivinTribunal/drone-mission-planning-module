"""thin orchestrator that runs all per-waypoint validation passes."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.flight_plan import ConstraintRule
from app.models.mission import DroneProfile

from ..types import LocalGeometries, Meters, Violation, WaypointData
from .altitude import _batch_check_minimum_agl
from .constraints import _check_constraint
from .drone import check_drone_constraints
from .obstacles import _batch_check_obstacles
from .zones import _batch_check_zones


def validate_inspection_pass(
    waypoints: list[WaypointData],
    drone: DroneProfile | None,
    constraints: list[ConstraintRule],
    local_geoms: LocalGeometries,
    elevation_provider=None,
    buffer_distance: Meters = 0.0,
    db: Session | None = None,
) -> list[Violation]:
    """validate all waypoints in an inspection pass.

    drone and constraint checks run per-waypoint (no spatial queries).
    obstacle and zone checks use Shapely in local coordinates.
    AGL altitude check uses elevation provider for terrain-aware validation.
    buffer_distance inflates obstacle boundaries by this many meters.
    """
    violations = []

    for i, wp in enumerate(waypoints):
        if drone:
            violation = check_drone_constraints(wp, drone)
            if violation:
                violation.waypoint_index = i
                violations.append(violation)

        for constraint in constraints:
            violation = _check_constraint(db, wp, constraint, [])
            if violation:
                violation.waypoint_index = i
                violations.append(violation)

    violations.extend(
        _batch_check_obstacles(waypoints, local_geoms, buffer_distance=buffer_distance)
    )
    violations.extend(_batch_check_zones(waypoints, local_geoms))

    if elevation_provider:
        violations.extend(_batch_check_minimum_agl(waypoints, elevation_provider))

    return violations
