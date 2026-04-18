"""backward-compatible re-exports - use app.services.trajectory.pathfinding instead."""

from app.services.trajectory.pathfinding import *  # noqa: F401, F403
from app.services.trajectory.pathfinding import (  # noqa: F401
    _adjust_transit_altitude_for_terrain,
    _build_visibility_graph,
    _check_cruise_clearance,
    _collect_graph_nodes_in_circle,
    _collect_nearby_objects_local,
    _extract_local_polygon_vertices,
    _is_segment_blocked,
    _max_effective_buffer,
    _max_turn_angle,
    _run_astar,
)
