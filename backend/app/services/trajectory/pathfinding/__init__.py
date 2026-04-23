"""pathfinding subpackage - visibility graph construction, A* search, collision reroute."""

from ..types import DEFAULT_OBSTACLE_RADIUS
from .collision import (
    check_obstacle,
    segment_runway_crossing_length,
    segments_intersect_obstacle,
    segments_intersect_zone,
)
from .search import (
    MAX_ASTAR_RETRIES,
    MIN_SEARCH_RADIUS,
    SEARCH_RADIUS_EXPANSION,
    SEARCH_RADIUS_MARGIN,
    _adjust_transit_altitude_for_terrain,
    _check_cruise_clearance,
    _max_effective_buffer,
    _max_turn_angle,
    _run_astar,
    compute_transit_path,
    has_line_of_sight,
    resolve_inspection_collisions,
)
from .visibility_graph import (
    _build_visibility_graph,
    _collect_graph_nodes_in_circle,
    _collect_nearby_objects_local,
    _extract_local_polygon_vertices,
    _is_segment_blocked,
)

__all__ = [
    "DEFAULT_OBSTACLE_RADIUS",
    "MAX_ASTAR_RETRIES",
    "MIN_SEARCH_RADIUS",
    "SEARCH_RADIUS_EXPANSION",
    "SEARCH_RADIUS_MARGIN",
    "check_obstacle",
    "segment_runway_crossing_length",
    "segments_intersect_obstacle",
    "segments_intersect_zone",
    "compute_transit_path",
    "has_line_of_sight",
    "resolve_inspection_collisions",
    "_adjust_transit_altitude_for_terrain",
    "_check_cruise_clearance",
    "_max_effective_buffer",
    "_max_turn_angle",
    "_run_astar",
    "_build_visibility_graph",
    "_collect_graph_nodes_in_circle",
    "_collect_nearby_objects_local",
    "_extract_local_polygon_vertices",
    "_is_segment_blocked",
]
