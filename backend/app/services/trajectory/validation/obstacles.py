"""obstacle containment and batch validation."""

from __future__ import annotations

from ..pathfinding.collision import check_obstacle, segments_intersect_obstacle
from ..types import LocalGeometries, Meters, Violation, WaypointData

__all__ = [
    "check_obstacle",
    "segments_intersect_obstacle",
    "_batch_check_obstacles",
]


def _batch_check_obstacles(
    waypoints: list[WaypointData],
    local_geoms: LocalGeometries,
    buffer_distance: Meters = 0.0,
) -> list[Violation]:
    """batch obstacle containment using Shapely in local coordinates.

    when buffer_distance > 0, obstacle boundaries are inflated by that many meters.
    falls back to per-obstacle buffer_distance when no override is provided.
    """
    if not local_geoms.obstacles or not waypoints:
        return []

    proj = local_geoms.proj
    violations = []

    for wp_idx, wp in enumerate(waypoints):
        pt = proj.point_to_local(wp.lon, wp.lat)

        for obs in local_geoms.obstacles:
            buf = buffer_distance if buffer_distance > 0 else obs.buffer_distance
            poly = obs.polygon.buffer(buf) if buf > 0 else obs.polygon
            if poly.contains(pt):
                obs_top = obs.base_alt + obs.height
                if wp.alt >= obs.base_alt and wp.alt <= obs_top:
                    violations.append(
                        Violation(
                            is_warning=False,
                            violation_kind="obstacle",
                            message=(
                                f"waypoint at {wp.alt:.0f}m intersects obstacle "
                                f"'{obs.name}' (top: {obs_top:.0f}m)"
                            ),
                            waypoint_index=wp_idx,
                        )
                    )

    return violations
