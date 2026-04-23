"""visibility graph construction - nodes, edges, and buffered polygon tests."""

from __future__ import annotations

import math

from shapely.geometry import LineString, Point
from shapely.prepared import prep

from app.core.config import settings
from app.utils.geo import euclidean_distance

from ..types import (
    GRID_EDGE_RADIUS,
    GRID_NODE_SPACING,
    HARD_ZONE_TYPES,
    RUNWAY_CROSSING_PENALTY_PER_METER,
    SURFACE_NODE_SPACING,
    LocalGeometries,
    LocalObstacle,
    LocalSurface,
    LocalZone,
    Meters,
)
from .collision import (
    segment_runway_crossing_length,
    segments_intersect_obstacle,
    segments_intersect_zone,
)


def _extract_local_polygon_vertices(
    polygon, buffer_m: float | None = None
) -> list[tuple[float, float]]:
    """extract vertices from Shapely polygon in local coords, offset outward by buffer distance."""
    offset = buffer_m if buffer_m is not None else settings.vertex_buffer_m

    buffered = polygon.buffer(offset)
    if buffered.is_empty:
        return []

    coords = list(buffered.exterior.coords)

    # skip closing duplicate of a closed ring
    if len(coords) > 1 and coords[0] == coords[-1]:
        coords = coords[:-1]

    return [(c[0], c[1]) for c in coords]


def _collect_nearby_objects_local(
    local_geoms: LocalGeometries,
    center_x: float,
    center_y: float,
    search_radius: Meters,
    buffer_distance_override: float | None = None,
) -> tuple[list[LocalObstacle], list[LocalZone]]:
    """collect obstacles and hard safety zones within search_radius of center."""
    nearby_obs = []
    for obs in local_geoms.obstacles:
        buf = (
            buffer_distance_override
            if buffer_distance_override is not None
            else obs.buffer_distance
        )
        buffered = obs.polygon.buffer(buf) if buf and buf > 0 else obs.polygon
        c = buffered.centroid
        if euclidean_distance(center_x, center_y, c.x, c.y) <= search_radius:
            nearby_obs.append(obs)

    nearby_zones = []
    for zone in local_geoms.zones:
        if zone.zone_type not in HARD_ZONE_TYPES:
            continue
        c = zone.polygon.centroid
        if euclidean_distance(center_x, center_y, c.x, c.y) <= search_radius:
            nearby_zones.append(zone)

    return nearby_obs, nearby_zones


def _is_segment_blocked(
    from_x: float,
    from_y: float,
    to_x: float,
    to_y: float,
    obstacles: list[LocalObstacle],
    zones: list[LocalZone],
    buffer_distance: Meters = 0.0,
) -> bool:
    """check if a straight-line segment is blocked by obstacles or hard zones."""
    for obs in obstacles:
        if segments_intersect_obstacle(from_x, from_y, to_x, to_y, obs, buffer_distance):
            return True

    for zone in zones:
        if zone.zone_type not in HARD_ZONE_TYPES:
            continue
        if segments_intersect_zone(from_x, from_y, to_x, to_y, zone.polygon):
            return True

    return False


def _build_visibility_graph(
    nodes: list[tuple[float, float, float]],
    obstacles: list[LocalObstacle],
    zones: list[LocalZone],
    surfaces: list[LocalSurface] | None = None,
    buffer_distance: Meters = 0.0,
    require_perpendicular_runway_crossing: bool = True,
    grid_start_index: int = -1,
) -> dict[int, list[tuple[int, float]]]:
    """build adjacency list where edges connect unobstructed node pairs.

    when require_perpendicular_runway_crossing is True, edges crossing runways
    get a distance penalty proportional to crossing length, making A* prefer
    routes that go around runways or cross perpendicularly. when False, no
    crossing penalty is applied so the planner picks the shortest geodesic.

    when grid_start_index >= 0, grid-to-grid edges beyond GRID_EDGE_RADIUS
    are skipped to keep the O(N^2) check manageable.

    all coordinates are in local meters. edge weights use euclidean distance.
    """
    graph: dict[int, list[tuple[int, float]]] = {i: [] for i in range(len(nodes))}

    # pre-buffer obstacles for the inner loop
    buffered_polys = []
    for obs in obstacles:
        buf = buffer_distance if buffer_distance > 0 else obs.buffer_distance
        poly = obs.polygon.buffer(buf) if buf > 0 else obs.polygon
        buffered_polys.append(poly)

    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            xi, yi = nodes[i][0], nodes[i][1]
            xj, yj = nodes[j][0], nodes[j][1]

            # grid-to-grid neighbor-radius optimization
            if grid_start_index >= 0 and i >= grid_start_index and j >= grid_start_index:
                if euclidean_distance(xi, yi, xj, yj) > GRID_EDGE_RADIUS:
                    continue

            # check obstacles with pre-buffered polygons
            blocked = False
            line = LineString([(xi, yi), (xj, yj)])
            for poly in buffered_polys:
                if line.intersects(poly):
                    blocked = True
                    break

            if not blocked:
                for zone in zones:
                    if zone.zone_type not in HARD_ZONE_TYPES:
                        continue
                    if line.intersects(zone.polygon):
                        blocked = True
                        break

            if blocked:
                continue

            dist = euclidean_distance(xi, yi, xj, yj)

            # add penalty for runway crossing
            if surfaces and require_perpendicular_runway_crossing:
                for surface in surfaces:
                    crossing = segment_runway_crossing_length(xi, yi, xj, yj, surface.polygon)
                    if crossing > 0:
                        dist += crossing * RUNWAY_CROSSING_PENALTY_PER_METER

            graph[i].append((j, dist))
            graph[j].append((i, dist))

    return graph


def _collect_graph_nodes_in_circle(
    endpoints: list[tuple[float, float, float]],
    obstacles: list[LocalObstacle],
    zones: list[LocalZone],
    surfaces: list[LocalSurface] | None,
    center: tuple[float, float],
    radius: Meters,
    buffer_distance_override: float | None = None,
    require_perpendicular_runway_crossing: bool = True,
) -> tuple[list[tuple[float, float, float]], int]:
    """collect nodes within search circle for visibility graph construction.

    includes endpoints, obstacle/zone vertices, surface edge nodes,
    and a regular grid fill in open space. returns (nodes, grid_start_index)
    where grid_start_index marks where grid nodes begin.
    all coordinates in local meters.
    """
    nodes = list(endpoints)

    def in_circle(x: float, y: float) -> bool:
        """check if point is within search radius of center."""
        return euclidean_distance(center[0], center[1], x, y) <= radius

    for obs in obstacles:
        buf = (
            buffer_distance_override
            if buffer_distance_override is not None
            else obs.buffer_distance
        )
        for v in _extract_local_polygon_vertices(obs.polygon, buf):
            if in_circle(v[0], v[1]):
                nodes.append((v[0], v[1], 0.0))

    for zone in zones:
        if zone.zone_type in HARD_ZONE_TYPES:
            for v in _extract_local_polygon_vertices(zone.polygon):
                if in_circle(v[0], v[1]):
                    nodes.append((v[0], v[1], 0.0))

    # surface edge nodes - spaced along centerline at SURFACE_NODE_SPACING
    if surfaces:
        for surface in surfaces:
            cl_coords = list(surface.centerline.coords)
            if len(cl_coords) < 2:
                continue

            start = cl_coords[0]
            end = cl_coords[-1]
            length = surface.length or surface.centerline.length
            half_w = (surface.width / 2.0) + settings.vertex_buffer_m

            # direction unit vector along centerline
            dx = end[0] - start[0]
            dy = end[1] - start[1]
            cl_len = math.sqrt(dx * dx + dy * dy)
            if cl_len == 0:
                continue
            ux, uy = dx / cl_len, dy / cl_len
            # perpendicular directions (left and right)
            perp_lx, perp_ly = -uy, ux
            perp_rx, perp_ry = uy, -ux

            # walk along centerline at spacing intervals
            num_points = max(2, int(length / SURFACE_NODE_SPACING) + 1)
            for k in range(num_points):
                frac = k / (num_points - 1)
                x = start[0] + (end[0] - start[0]) * frac
                y = start[1] + (end[1] - start[1]) * frac

                xl = x + perp_lx * half_w
                yl = y + perp_ly * half_w
                xr = x + perp_rx * half_w
                yr = y + perp_ry * half_w

                if in_circle(xl, yl):
                    nodes.append((xl, yl, 0.0))
                if in_circle(xr, yr):
                    nodes.append((xr, yr, 0.0))

            # perpendicular crossing nodes
            if len(endpoints) >= 2 and require_perpendicular_runway_crossing:
                p0, p1 = endpoints[0], endpoints[1]
                rdx = end[0] - start[0]
                rdy = end[1] - start[1]
                edx = p1[0] - p0[0]
                edy = p1[1] - p0[1]
                denom = edx * rdy - edy * rdx
                if abs(denom) > 1e-15:
                    u = ((p0[1] - start[1]) * edx - (p0[0] - start[0]) * edy) / denom
                    u = max(0.0, min(1.0, u))
                    proj_x = start[0] + u * rdx
                    proj_y = start[1] + u * rdy

                    pl_x = proj_x + perp_lx * half_w
                    pl_y = proj_y + perp_ly * half_w
                    pr_x = proj_x + perp_rx * half_w
                    pr_y = proj_y + perp_ry * half_w

                    if in_circle(pl_x, pl_y):
                        nodes.append((pl_x, pl_y, 0.0))
                    if in_circle(pr_x, pr_y):
                        nodes.append((pr_x, pr_y, 0.0))

    # grid fill - regular 2D grid in navigable open space
    grid_start_index = len(nodes)

    cruise_z = sum(ep[2] for ep in endpoints) / len(endpoints) if endpoints else 0.0

    # pre-build exclusion polygons
    exclusion_polys = []
    for obs in obstacles:
        buf = (
            buffer_distance_override
            if buffer_distance_override is not None
            else obs.buffer_distance
        )
        buffered = obs.polygon.buffer(buf) if buf and buf > 0 else obs.polygon
        exclusion_polys.append(prep(buffered))

    for zone in zones:
        if zone.zone_type in HARD_ZONE_TYPES:
            exclusion_polys.append(prep(zone.polygon))

    x_min = center[0] - radius
    x_max = center[0] + radius
    y_min = center[1] - radius
    y_max = center[1] + radius

    x = x_min
    while x <= x_max:
        y = y_min
        while y <= y_max:
            if in_circle(x, y):
                pt = Point(x, y)
                if not any(ep.contains(pt) for ep in exclusion_polys):
                    nodes.append((x, y, cruise_z))
            y += GRID_NODE_SPACING
        x += GRID_NODE_SPACING

    return nodes, grid_start_index
