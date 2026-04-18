import logging
import math

from app.core.config import settings
from app.core.exceptions import TrajectoryGenerationError
from app.models.enums import CameraAction, WaypointType
from app.services.safety_validator import (
    check_obstacle,
    segment_runway_crossing_length,
    segments_intersect_obstacle,
    segments_intersect_zone,
)
from app.services.trajectory_types import (
    DEFAULT_OBSTACLE_RADIUS,
    HARD_ZONE_TYPES,
    MAX_REROUTE_DEVIATION,
    MAX_TURN_ANGLE,
    REROUTE_SEARCH_RADIUS_MULTIPLIER,
    RUNWAY_CROSSING_PENALTY_PER_METER,
    SURFACE_NODE_SPACING,
    TRANSIT_AGL,
    Degrees,
    LocalGeometries,
    LocalObstacle,
    LocalSurface,
    LocalZone,
    Meters,
    MetersPerSecond,
    Point3D,
    WaypointData,
)
from app.utils.geo import (
    astar,
    bearing_between,
    elevation_angle,
    euclidean_distance,
    total_path_distance,
)

logger = logging.getLogger(__name__)

# search radius constants for circle-based A*
MIN_SEARCH_RADIUS: Meters = 200.0
SEARCH_RADIUS_MARGIN = 1.2
SEARCH_RADIUS_EXPANSION = 1.5
MAX_ASTAR_RETRIES = 3


def _extract_local_polygon_vertices(
    polygon, buffer_m: float | None = None
) -> list[tuple[float, float]]:
    """extract vertices from Shapely polygon in local coords, offset outward by buffer distance."""
    coords = list(polygon.exterior.coords)

    # skip closing duplicate of a closed ring
    if len(coords) > 1 and coords[0] == coords[-1]:
        coords = coords[:-1]

    if len(coords) < 3:
        return []

    offset = buffer_m if buffer_m is not None else settings.vertex_buffer_m

    # compute centroid for offset direction
    cx = sum(c[0] for c in coords) / len(coords)
    cy = sum(c[1] for c in coords) / len(coords)

    vertices = []
    for c in coords:
        dx, dy = c[0] - cx, c[1] - cy
        d = math.sqrt(dx * dx + dy * dy)
        if d > 0:
            x = c[0] + (dx / d) * offset
            y = c[1] + (dy / d) * offset
        else:
            x, y = c[0], c[1]
        vertices.append((x, y))

    return vertices


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
        verts = _extract_local_polygon_vertices(obs.polygon, buf)
        if not verts:
            continue
        obs_cx = sum(v[0] for v in verts) / len(verts)
        obs_cy = sum(v[1] for v in verts) / len(verts)
        if euclidean_distance(center_x, center_y, obs_cx, obs_cy) <= search_radius:
            nearby_obs.append(obs)

    nearby_zones = []
    for zone in local_geoms.zones:
        if zone.zone_type not in HARD_ZONE_TYPES:
            continue
        verts = _extract_local_polygon_vertices(zone.polygon)
        if not verts:
            continue
        zone_cx = sum(v[0] for v in verts) / len(verts)
        zone_cy = sum(v[1] for v in verts) / len(verts)
        if euclidean_distance(center_x, center_y, zone_cx, zone_cy) <= search_radius:
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
) -> dict[int, list[tuple[int, float]]]:
    """build adjacency list where edges connect unobstructed node pairs.

    when require_perpendicular_runway_crossing is True, edges crossing runways
    get a distance penalty proportional to crossing length, making A* prefer
    routes that go around runways or cross perpendicularly. when False, no
    crossing penalty is applied so the planner picks the shortest geodesic.

    all coordinates are in local meters. edge weights use euclidean distance.
    """
    graph: dict[int, list[tuple[int, float]]] = {i: [] for i in range(len(nodes))}

    # pre-buffer obstacles for the inner loop
    buffered_polys = []
    for obs in obstacles:
        buf = buffer_distance if buffer_distance > 0 else obs.buffer_distance
        poly = obs.polygon.buffer(buf) if buf > 0 else obs.polygon
        buffered_polys.append(poly)

    from shapely.geometry import LineString

    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            xi, yi = nodes[i][0], nodes[i][1]
            xj, yj = nodes[j][0], nodes[j][1]

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
) -> list[tuple[float, float, float]]:
    """collect nodes within search circle for visibility graph construction.

    includes endpoints plus nearby vertices from obstacles, hard zones,
    and runway/taxiway surfaces. all coordinates in local meters.
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

    return nodes


def _run_astar(
    from_local: tuple[float, float, float],
    to_local: tuple[float, float, float],
    obstacles: list[LocalObstacle],
    zones: list[LocalZone],
    surfaces: list[LocalSurface] | None = None,
    buffer_distance_override: float | None = None,
    require_perpendicular_runway_crossing: bool = True,
) -> list[tuple[float, float, float]] | None:
    """circle-based A* pathfinding with expanding search radius on failure.

    builds a visibility graph within a circle centered on the midpoint
    of from_local to to_local. expands the radius and retries if no
    path is found. all coordinates in local meters.
    """
    mid_x = (from_local[0] + to_local[0]) / 2
    mid_y = (from_local[1] + to_local[1]) / 2
    base_dist = euclidean_distance(from_local[0], from_local[1], to_local[0], to_local[1])
    radius = max(base_dist * SEARCH_RADIUS_MARGIN / 2, MIN_SEARCH_RADIUS)

    for attempt in range(MAX_ASTAR_RETRIES):
        nodes = _collect_graph_nodes_in_circle(
            [from_local, to_local],
            obstacles,
            zones,
            surfaces,
            (mid_x, mid_y),
            radius,
            buffer_distance_override=buffer_distance_override,
            require_perpendicular_runway_crossing=require_perpendicular_runway_crossing,
        )
        graph = _build_visibility_graph(
            nodes,
            obstacles,
            zones,
            surfaces,
            buffer_distance=(
                buffer_distance_override if buffer_distance_override is not None else 0.0
            ),
            require_perpendicular_runway_crossing=require_perpendicular_runway_crossing,
        )

        path_indices = astar(graph, 0, 1, nodes, use_euclidean=True)
        if path_indices is not None:
            return [nodes[idx] for idx in path_indices]

        # expand search radius and retry
        radius *= SEARCH_RADIUS_EXPANSION

    return None


def has_line_of_sight(
    point: Point3D,
    target: Point3D,
    local_geoms: LocalGeometries,
    buffer_distance: Meters = 0.0,
) -> bool:
    """check if the line from point to target is clear of obstacles and hard zones."""
    proj = local_geoms.proj
    from_x, from_y = proj.to_local(point.lon, point.lat)
    to_x, to_y = proj.to_local(target.lon, target.lat)
    return not _is_segment_blocked(
        from_x,
        from_y,
        to_x,
        to_y,
        local_geoms.obstacles,
        local_geoms.zones,
        buffer_distance=buffer_distance,
    )


def _max_turn_angle(waypoints: list[WaypointData]) -> Degrees:
    """compute the maximum turn angle between consecutive waypoint headings."""
    max_angle = 0.0
    for i in range(1, len(waypoints)):
        diff = abs(waypoints[i].heading - waypoints[i - 1].heading)
        if diff > 180:
            diff = 360 - diff
        max_angle = max(max_angle, diff)

    return max_angle


def _max_effective_buffer(
    obstacles: list[LocalObstacle],
    buffer_distance_override: float | None,
) -> float:
    """largest effective buffer distance across all obstacles.

    when an explicit positive override is given, use it (or DEFAULT when there
    are no obstacles). for a zero or None override fall back to the per-obstacle
    buffers so the reroute search radius never collapses to zero.
    """
    if buffer_distance_override is not None and buffer_distance_override > 0:
        return buffer_distance_override if obstacles else DEFAULT_OBSTACLE_RADIUS
    return max(
        (
            obs.buffer_distance if obs.buffer_distance is not None else DEFAULT_OBSTACLE_RADIUS
            for obs in obstacles
        ),
        default=DEFAULT_OBSTACLE_RADIUS,
    )


def resolve_inspection_collisions(
    waypoints: list[WaypointData],
    local_geoms: LocalGeometries,
    center: Point3D,
    buffer_distance_override: float | None = None,
    require_perpendicular_runway_crossing: bool = True,
) -> list[WaypointData]:
    """A*-based rerouting of measurement waypoints around obstacles and safety zones.

    finds alternative positions that preserve measurement geometry (distance
    to center, line-of-sight to PAPI, max turn angle).
    """
    proj = local_geoms.proj

    # find colliding waypoints
    collisions = [False] * len(waypoints)
    for i, wp in enumerate(waypoints):
        wx, wy = proj.to_local(wp.lon, wp.lat)
        for obs in local_geoms.obstacles:
            buf = (
                buffer_distance_override
                if buffer_distance_override is not None
                else obs.buffer_distance
            )
            if check_obstacle(wx, wy, wp.alt, obs, buffer_distance=buf):
                collisions[i] = True
                break

    if not any(collisions):
        return waypoints

    # find contiguous collision segments
    segments: list[tuple[int, int]] = []
    seg_start = None
    for i, hit in enumerate(collisions):
        if hit and seg_start is None:
            seg_start = i
        elif not hit and seg_start is not None:
            segments.append((seg_start, i - 1))
            seg_start = None
    if seg_start is not None:
        segments.append((seg_start, len(waypoints) - 1))

    result = list(waypoints)

    for seg_start, seg_end in segments:
        if seg_start == 0 or seg_end == len(waypoints) - 1:
            raise TrajectoryGenerationError(
                "obstacle at measurement pass boundary - cannot reroute"
            )

        anchor_before = result[seg_start - 1]
        anchor_after = result[seg_end + 1]
        from_pt = Point3D(lon=anchor_before.lon, lat=anchor_before.lat, alt=anchor_before.alt)
        to_pt = Point3D(lon=anchor_after.lon, lat=anchor_after.lat, alt=anchor_after.alt)

        # collect nearby obstacles AND safety zones
        mid_lon = (from_pt.lon + to_pt.lon) / 2
        mid_lat = (from_pt.lat + to_pt.lat) / 2
        mid_x, mid_y = proj.to_local(mid_lon, mid_lat)
        max_buffer = _max_effective_buffer(local_geoms.obstacles, buffer_distance_override)
        search_radius = max_buffer * REROUTE_SEARCH_RADIUS_MULTIPLIER
        nearby_obs, nearby_zones = _collect_nearby_objects_local(
            local_geoms,
            mid_x,
            mid_y,
            search_radius,
            buffer_distance_override=buffer_distance_override,
        )

        from_local = (*proj.to_local(from_pt.lon, from_pt.lat), from_pt.alt)
        to_local = (*proj.to_local(to_pt.lon, to_pt.lat), to_pt.alt)

        # A* through local visibility graph
        path = _run_astar(
            from_local,
            to_local,
            nearby_obs,
            nearby_zones,
            local_geoms.surfaces,
            buffer_distance_override=buffer_distance_override,
            require_perpendicular_runway_crossing=require_perpendicular_runway_crossing,
        )
        if path is None:
            raise TrajectoryGenerationError("no obstacle-free reroute path found")

        # convert path back to WGS84 and build rerouted waypoints (skip anchors)
        rerouted_wps = []
        for node in path[1:-1]:
            lon, lat = proj.to_wgs84(node[0], node[1])
            heading = bearing_between(lon, lat, center.lon, center.lat)
            pitch = elevation_angle(
                lon,
                lat,
                anchor_before.alt,
                center.lon,
                center.lat,
                center.alt,
            )

            rerouted_wps.append(
                WaypointData(
                    lon=lon,
                    lat=lat,
                    alt=anchor_before.alt,
                    heading=heading,
                    speed=anchor_before.speed,
                    waypoint_type=WaypointType.MEASUREMENT,
                    camera_action=CameraAction.PHOTO_CAPTURE,
                    camera_target=center,
                    inspection_id=anchor_before.inspection_id,
                    gimbal_pitch=pitch,
                )
            )

        if not rerouted_wps:
            raise TrajectoryGenerationError(
                "reroute produced no intermediate waypoints"
                " - obstacle may be too close to flight path"
            )

        # validate: path deviation
        original_pts = [
            (result[k].lon, result[k].lat, result[k].alt) for k in range(seg_start, seg_end + 1)
        ]
        rerouted_pts = [(w.lon, w.lat, w.alt) for w in rerouted_wps]
        original_dist = total_path_distance(original_pts)
        rerouted_dist = total_path_distance(rerouted_pts) if rerouted_pts else 0.0

        if original_dist > 0 and rerouted_dist > original_dist * (1 + MAX_REROUTE_DEVIATION):
            raise TrajectoryGenerationError(
                f"rerouted path {rerouted_dist:.0f}m exceeds {MAX_REROUTE_DEVIATION:.0%} deviation"
            )

        # validate: line-of-sight to PAPI center
        for wp in rerouted_wps:
            wp_pt = Point3D(lon=wp.lon, lat=wp.lat, alt=wp.alt)
            if not has_line_of_sight(wp_pt, center, local_geoms):
                raise TrajectoryGenerationError("rerouted path blocks camera line-of-sight to PAPI")

        # validate: turn angle
        if rerouted_wps and _max_turn_angle(rerouted_wps) > MAX_TURN_ANGLE:
            raise TrajectoryGenerationError(
                f"rerouted path exceeds max turn angle {MAX_TURN_ANGLE}"
            )

        result[seg_start : seg_end + 1] = rerouted_wps

    return result


def _adjust_transit_altitude_for_terrain(
    waypoints: list[WaypointData],
    elevation_provider,
    transit_agl: Meters = TRANSIT_AGL,
) -> None:
    """set transit waypoint altitudes to transit_agl above terrain."""
    if not elevation_provider or not waypoints:
        return

    points = [(wp.lat, wp.lon) for wp in waypoints]
    elevations = elevation_provider.get_elevations_batch(points)
    if len(elevations) != len(points):
        raise TrajectoryGenerationError(f"expected {len(points)} elevations, got {len(elevations)}")

    for wp, ground in zip(waypoints, elevations):
        wp.alt = ground + transit_agl


def _check_cruise_clearance(
    waypoints: list[WaypointData],
    local_geoms: LocalGeometries,
) -> None:
    """re-validate transit segments after altitude rewrite.

    after we rewrite transit altitudes to the cruise level, the segments
    could in principle cross an obstacle/zone that was fine at the old
    altitude. run a lightweight segment check and raise a clear error if
    the cruise level conflicts with obstacle clearance.
    """
    if not waypoints:
        return

    proj = local_geoms.proj
    for k in range(1, len(waypoints)):
        prev, cur = waypoints[k - 1], waypoints[k]
        from_x, from_y = proj.to_local(prev.lon, prev.lat)
        to_x, to_y = proj.to_local(cur.lon, cur.lat)
        if _is_segment_blocked(
            from_x, from_y, to_x, to_y, local_geoms.obstacles, local_geoms.zones
        ):
            raise TrajectoryGenerationError("cruise altitude conflicts with obstacle clearance")


def compute_transit_path(
    from_point: Point3D,
    to_point: Point3D,
    local_geoms: LocalGeometries,
    speed: MetersPerSecond,
    elevation_provider=None,
    transit_agl: Meters = TRANSIT_AGL,
    buffer_distance_override: float | None = None,
    require_perpendicular_runway_crossing: bool = True,
) -> list[WaypointData]:
    """compute A* transit path - shortest obstacle-free route with runway crossing penalties.

    all returned transit waypoints share ground + transit_agl as their altitude
    so the vertical profile stays flat between inspection passes.

    when require_perpendicular_runway_crossing is False, runway crossings are
    treated like any other clear segment so the planner picks the shortest
    geodesic, minimising the runway-closure window the operator must request.
    """
    proj = local_geoms.proj
    from_x, from_y = proj.to_local(from_point.lon, from_point.lat)
    to_x, to_y = proj.to_local(to_point.lon, to_point.lat)

    # straight-line if path is clear and doesn't cross runway
    fast_path_buffer = buffer_distance_override if buffer_distance_override is not None else 0.0
    if not _is_segment_blocked(
        from_x,
        from_y,
        to_x,
        to_y,
        local_geoms.obstacles,
        local_geoms.zones,
        buffer_distance=fast_path_buffer,
    ):
        crosses_runway = False
        if local_geoms.surfaces and require_perpendicular_runway_crossing:
            for surface in local_geoms.surfaces:
                crossing = segment_runway_crossing_length(
                    from_x, from_y, to_x, to_y, surface.polygon
                )
                if crossing > 0:
                    crosses_runway = True
                    break

        # if direct path crosses runway, still use A* to find a better route
        if not crosses_runway:
            wps = [
                WaypointData(
                    lon=to_point.lon,
                    lat=to_point.lat,
                    alt=to_point.alt,
                    heading=bearing_between(
                        from_point.lon, from_point.lat, to_point.lon, to_point.lat
                    ),
                    speed=speed,
                    waypoint_type=WaypointType.TRANSIT,
                    camera_action=CameraAction.NONE,
                )
            ]
            _adjust_transit_altitude_for_terrain(wps, elevation_provider, transit_agl)
            _check_cruise_clearance(wps, local_geoms)
            return wps

    # A* through visibility graph with runway penalties in local coords
    from_local = (from_x, from_y, from_point.alt)
    to_local = (to_x, to_y, to_point.alt)

    path = _run_astar(
        from_local,
        to_local,
        local_geoms.obstacles,
        local_geoms.zones,
        local_geoms.surfaces,
        buffer_distance_override=buffer_distance_override,
        require_perpendicular_runway_crossing=require_perpendicular_runway_crossing,
    )
    if path is None:
        raise TrajectoryGenerationError("no obstacle-free transit path found")

    # initial altitude = max of endpoints
    fallback_alt = max(from_point.alt, to_point.alt)

    # convert back to WGS84 and build TRANSIT waypoints (skip from_point at index 0)
    transit_wps = []
    for k in range(1, len(path)):
        prev_lon, prev_lat = proj.to_wgs84(path[k - 1][0], path[k - 1][1])
        cur_lon, cur_lat = proj.to_wgs84(path[k][0], path[k][1])
        transit_wps.append(
            WaypointData(
                lon=cur_lon,
                lat=cur_lat,
                alt=fallback_alt,
                heading=bearing_between(prev_lon, prev_lat, cur_lon, cur_lat),
                speed=speed,
                waypoint_type=WaypointType.TRANSIT,
                camera_action=CameraAction.NONE,
            )
        )

    _adjust_transit_altitude_for_terrain(transit_wps, elevation_provider, transit_agl)
    _check_cruise_clearance(transit_wps, local_geoms)

    return transit_wps
