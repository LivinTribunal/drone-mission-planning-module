"""minimum AGL check against terrain elevation."""

from __future__ import annotations

from app.core.exceptions import TrajectoryGenerationError
from app.models.enums import WaypointType

from ..types import MINIMUM_ALTITUDE_THRESHOLD, Violation, WaypointData

# waypoint types exempt from AGL minimum check - these literally touch the ground
_GROUND_LEVEL_WAYPOINT_TYPES = (WaypointType.TAKEOFF, WaypointType.LANDING)


def _batch_check_minimum_agl(
    waypoints: list[WaypointData],
    elevation_provider,
    min_agl: float = MINIMUM_ALTITUDE_THRESHOLD,
) -> list[Violation]:
    """check in-flight waypoints maintain minimum height above ground level.

    all AGL violations are soft warnings - PAPI approach paths inherently
    place measurement waypoints below 30m AGL by design (3 deg glide slope
    at ~400m distance = ~21m AGL). transit waypoints are already hard-clamped
    in _adjust_transit_altitude_for_terrain. TAKEOFF and LANDING waypoints
    are exempt by design - they sit on the ground.
    """
    if not waypoints:
        return []

    # pre-filter ground-level waypoints to skip unnecessary elevation lookups
    indexed_wps = [
        (i, wp)
        for i, wp in enumerate(waypoints)
        if wp.waypoint_type not in _GROUND_LEVEL_WAYPOINT_TYPES
    ]
    if not indexed_wps:
        return []

    points = [(wp.lat, wp.lon) for _, wp in indexed_wps]
    elevations = elevation_provider.get_elevations_batch(points)
    if len(elevations) != len(points):
        raise TrajectoryGenerationError(f"expected {len(points)} elevations, got {len(elevations)}")

    violations = []
    for (i, wp), ground in zip(indexed_wps, elevations):
        agl = wp.alt - ground
        if agl < min_agl:
            violations.append(
                Violation(
                    is_warning=True,
                    violation_kind="altitude",
                    message=(
                        f"{wp.waypoint_type} at {wp.alt:.0f}m is only {agl:.1f}m AGL "
                        f"(min {min_agl:.0f}m)"
                    ),
                    waypoint_index=i,
                )
            )

    return violations
