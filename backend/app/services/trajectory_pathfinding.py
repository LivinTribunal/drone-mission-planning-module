import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import TrajectoryGenerationError
from app.models.airport import AirfieldSurface, Obstacle, SafetyZone
from app.models.enums import CameraAction, WaypointType
from app.schemas.geometry import parse_ewkb
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
    Meters,
    MetersPerSecond,
    Point3D,
    WaypointData,
)
from app.utils.geo import (
    astar,
    bearing_between,
    center_of_points,
    distance_between,
    elevation_angle,
    point_at_distance,
    total_path_distance,
)

logger = logging.getLogger(__name__)

# search radius constants for circle-based A*
MIN_SEARCH_RADIUS: Meters = 200.0
SEARCH_RADIUS_MARGIN = 1.2
SEARCH_RADIUS_EXPANSION = 1.5
MAX_ASTAR_RETRIES = 3


def _extract_polygon_vertices(geom_data: bytes, buffer_m: float | None = None) -> list[Point3D]:
    """extract vertices from polygon geometry, offset outward from centroid by buffer distance."""
    try:
        geojson = parse_ewkb(geom_data)
        if geojson["type"] != "Polygon":
            return []

        if not geojson.get("coordinates"):
            return []
        coords = geojson["coordinates"][0]

        # skip closing duplicate of a closed ring
        if len(coords) > 1 and coords[0][:2] == coords[-1][:2]:
            coords = coords[:-1]

        if len(coords) < 3:
            return []

        offset = buffer_m if buffer_m is not None else settings.vertex_buffer_m

        # compute centroid for offset direction
        cx = sum(c[0] for c in coords) / len(coords)
        cy = sum(c[1] for c in coords) / len(coords)

        vertices = []
        for c in coords:
            alt = c[2] if len(c) > 2 else 0.0
            # push vertex away from centroid by buffer distance
            brng = bearing_between(cx, cy, c[0], c[1])
            lon, lat = point_at_distance(c[0], c[1], brng, offset)
            vertices.append(Point3D(lon=lon, lat=lat, alt=alt))

        return vertices

    except (ValueError, KeyError, TypeError, IndexError) as e:
        raise TrajectoryGenerationError(
            f"failed to extract vertices from obstacle geometry: {e}"
        ) from e


def _collect_nearby_objects(
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    center_lon: float,
    center_lat: float,
    search_radius: Meters,
    buffer_distance_override: float | None = None,
) -> tuple[list[Obstacle], list[SafetyZone]]:
    """collect obstacles and hard safety zones within search_radius of center."""
    nearby_obs = []
    for obs in obstacles:
        if not obs.boundary:
            continue
        try:
            buf = (
                buffer_distance_override
                if buffer_distance_override is not None
                else obs.buffer_distance
            )
            verts = _extract_polygon_vertices(obs.boundary.data, buf)
            if not verts:
                continue
            obs_center = center_of_points([v.to_tuple() for v in verts])
        except TrajectoryGenerationError:
            raise
        except (ValueError, KeyError, TypeError, IndexError) as e:
            raise TrajectoryGenerationError(
                f"failed to parse obstacle boundary for obstacle {obs.id}: {e}"
            ) from e
        if distance_between(center_lon, center_lat, obs_center[0], obs_center[1]) <= search_radius:
            nearby_obs.append(obs)

    nearby_zones = []
    for zone in zones:
        if not zone.geometry or zone.type not in HARD_ZONE_TYPES:
            continue

        # approximate zone distance by checking if zone center is within range
        try:
            verts = _extract_polygon_vertices(zone.geometry.data)
            if not verts:
                continue
            zone_center = center_of_points([v.to_tuple() for v in verts])
        except TrajectoryGenerationError:
            raise
        except (ValueError, KeyError, TypeError, IndexError) as e:
            raise TrajectoryGenerationError(
                f"failed to parse zone geometry for zone {zone.id}: {e}"
            ) from e
        zone_dist = distance_between(center_lon, center_lat, zone_center[0], zone_center[1])
        if zone_dist <= search_radius:
            nearby_zones.append(zone)

    return nearby_obs, nearby_zones


def _is_segment_blocked(
    db: Session,
    from_pt: Point3D,
    to_pt: Point3D,
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    buffer_distance: Meters = 0.0,
) -> bool:
    """check if a straight-line segment is blocked by obstacles or hard zones."""
    for obs in obstacles:
        buf = buffer_distance if buffer_distance > 0 else (obs.buffer_distance or 0.0)
        if segments_intersect_obstacle(
            db, from_pt.lon, from_pt.lat, to_pt.lon, to_pt.lat, obs, buffer_distance=buf
        ):
            return True

    for zone in zones:
        if segments_intersect_zone(db, from_pt.lon, from_pt.lat, to_pt.lon, to_pt.lat, zone):
            return True

    return False


def _build_visibility_graph(
    db: Session,
    nodes: list[Point3D],
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    surfaces: list[AirfieldSurface] | None = None,
    buffer_distance: Meters = 0.0,
    require_perpendicular_runway_crossing: bool = True,
) -> dict[int, list[tuple[int, float]]]:
    """build adjacency list where edges connect unobstructed node pairs.

    when require_perpendicular_runway_crossing is True, edges crossing runways
    get a distance penalty proportional to crossing length, making A* prefer
    routes that go around runways or cross perpendicularly. when False, no
    crossing penalty is applied so the planner picks the shortest geodesic.
    """
    graph: dict[int, list[tuple[int, float]]] = {i: [] for i in range(len(nodes))}

    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            if _is_segment_blocked(
                db, nodes[i], nodes[j], obstacles, zones, buffer_distance=buffer_distance
            ):
                continue

            dist = distance_between(nodes[i].lon, nodes[i].lat, nodes[j].lon, nodes[j].lat)

            # add penalty for runway crossing - skipped when operator opts into
            # shortest-geodesic crossing to minimise runway closure window
            if surfaces and require_perpendicular_runway_crossing:
                for surface in surfaces:
                    crossing = segment_runway_crossing_length(
                        db,
                        nodes[i].lon,
                        nodes[i].lat,
                        nodes[j].lon,
                        nodes[j].lat,
                        surface,
                    )
                    if crossing > 0:
                        dist += crossing * RUNWAY_CROSSING_PENALTY_PER_METER

            graph[i].append((j, dist))
            graph[j].append((i, dist))

    return graph


def _collect_graph_nodes_in_circle(
    endpoints: list[Point3D],
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    surfaces: list[AirfieldSurface] | None,
    center: Point3D,
    radius: Meters,
    buffer_distance_override: float | None = None,
    require_perpendicular_runway_crossing: bool = True,
) -> list[Point3D]:
    """collect nodes within search circle for visibility graph construction.

    includes endpoints plus nearby vertices from obstacles, hard zones,
    and runway/taxiway surfaces.
    """
    nodes = list(endpoints)

    def in_circle(pt: Point3D) -> bool:
        """check if point is within search radius of center."""
        return distance_between(center.lon, center.lat, pt.lon, pt.lat) <= radius

    for obs in obstacles:
        if obs.boundary:
            buf = (
                buffer_distance_override
                if buffer_distance_override is not None
                else obs.buffer_distance
            )
            for v in _extract_polygon_vertices(obs.boundary.data, buf):
                if in_circle(v):
                    nodes.append(v)

    for zone in zones:
        if zone.geometry and zone.type in HARD_ZONE_TYPES:
            for v in _extract_polygon_vertices(zone.geometry.data):
                if in_circle(v):
                    nodes.append(v)

    # surface edge nodes - spaced along centerline at SURFACE_NODE_SPACING
    if surfaces:
        for surface in surfaces:
            if not surface.geometry:
                continue
            try:
                geojson = parse_ewkb(surface.geometry.data)
            except (ValueError, KeyError, TypeError, IndexError) as e:
                raise TrajectoryGenerationError(
                    f"corrupted geometry for surface {surface.id}: {e}"
                ) from e
            if geojson.get("type") != "LineString":
                continue

            coords = geojson.get("coordinates")
            if not coords:
                continue
            start = coords[0]
            end = coords[-1]
            length = surface.length or distance_between(start[0], start[1], end[0], end[1])
            half_w = ((surface.width or 45.0) / 2.0) + settings.vertex_buffer_m
            rwy_brng = bearing_between(start[0], start[1], end[0], end[1])
            perp_l = (rwy_brng + 90) % 360
            perp_r = (rwy_brng - 90) % 360

            # walk along centerline at spacing intervals
            num_points = max(2, int(length / SURFACE_NODE_SPACING) + 1)
            for i in range(num_points):
                frac = i / (num_points - 1)
                lon = start[0] + (end[0] - start[0]) * frac
                lat = start[1] + (end[1] - start[1]) * frac
                alt_s = start[2] if len(start) > 2 else 0.0
                alt_e = end[2] if len(end) > 2 else 0.0
                alt = alt_s + (alt_e - alt_s) * frac

                lon_l, lat_l = point_at_distance(lon, lat, perp_l, half_w)
                lon_r, lat_r = point_at_distance(lon, lat, perp_r, half_w)

                pt_l = Point3D(lon=lon_l, lat=lat_l, alt=alt)
                pt_r = Point3D(lon=lon_r, lat=lat_r, alt=alt)

                if in_circle(pt_l):
                    nodes.append(pt_l)
                if in_circle(pt_r):
                    nodes.append(pt_r)

            # perpendicular crossing nodes - intersect the from->to line with
            # the runway centerline so A* always has the shortest-crossing option.
            # skipped when shortest-geodesic crossing is enabled because the
            # extra anchor nodes would bias A* back toward perpendicular paths.
            if len(endpoints) >= 2 and require_perpendicular_runway_crossing:
                p0, p1 = endpoints[0], endpoints[1]
                rdx = end[0] - start[0]
                rdy = end[1] - start[1]
                edx = p1.lon - p0.lon
                edy = p1.lat - p0.lat
                denom = edx * rdy - edy * rdx
                if abs(denom) > 1e-15:
                    u = ((p0.lat - start[1]) * edx - (p0.lon - start[0]) * edy) / denom
                    u = max(0.0, min(1.0, u))
                    proj_lon = start[0] + u * rdx
                    proj_lat = start[1] + u * rdy
                    alt_s = start[2] if len(start) > 2 else 0.0
                    alt_e = end[2] if len(end) > 2 else 0.0
                    proj_alt = alt_s + (alt_e - alt_s) * u

                    pl_lon, pl_lat = point_at_distance(proj_lon, proj_lat, perp_l, half_w)
                    pr_lon, pr_lat = point_at_distance(proj_lon, proj_lat, perp_r, half_w)
                    perp_pt_l = Point3D(lon=pl_lon, lat=pl_lat, alt=proj_alt)
                    perp_pt_r = Point3D(lon=pr_lon, lat=pr_lat, alt=proj_alt)

                    if in_circle(perp_pt_l):
                        nodes.append(perp_pt_l)
                    if in_circle(perp_pt_r):
                        nodes.append(perp_pt_r)

    return nodes


def _run_astar(
    db: Session,
    from_point: Point3D,
    to_point: Point3D,
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    surfaces: list[AirfieldSurface] | None = None,
    buffer_distance_override: float | None = None,
    require_perpendicular_runway_crossing: bool = True,
) -> list[Point3D] | None:
    """circle-based A* pathfinding with expanding search radius on failure.

    builds a visibility graph within a circle centered on the midpoint
    of from_point to to_point. expands the radius and retries if no
    path is found.
    """
    mid = Point3D(
        lon=(from_point.lon + to_point.lon) / 2,
        lat=(from_point.lat + to_point.lat) / 2,
        alt=(from_point.alt + to_point.alt) / 2,
    )
    base_dist = distance_between(from_point.lon, from_point.lat, to_point.lon, to_point.lat)
    radius = max(base_dist * SEARCH_RADIUS_MARGIN / 2, MIN_SEARCH_RADIUS)

    for attempt in range(MAX_ASTAR_RETRIES):
        nodes = _collect_graph_nodes_in_circle(
            [from_point, to_point],
            obstacles,
            zones,
            surfaces,
            mid,
            radius,
            buffer_distance_override=buffer_distance_override,
            require_perpendicular_runway_crossing=require_perpendicular_runway_crossing,
        )
        graph = _build_visibility_graph(
            db,
            nodes,
            obstacles,
            zones,
            surfaces,
            buffer_distance=(
                buffer_distance_override if buffer_distance_override is not None else 0.0
            ),
            require_perpendicular_runway_crossing=require_perpendicular_runway_crossing,
        )
        node_tuples = [n.to_tuple() for n in nodes]

        path_indices = astar(graph, 0, 1, node_tuples)
        if path_indices is not None:
            return [nodes[idx] for idx in path_indices]

        # expand search radius and retry
        radius *= SEARCH_RADIUS_EXPANSION

    return None


def has_line_of_sight(
    db: Session,
    point: Point3D,
    target: Point3D,
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    buffer_distance: Meters = 0.0,
) -> bool:
    """check if the line from point to target is clear of obstacles and hard zones."""
    return not _is_segment_blocked(
        db, point, target, obstacles, zones, buffer_distance=buffer_distance
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
    obstacles: list[Obstacle],
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
    db: Session,
    waypoints: list[WaypointData],
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    center: Point3D,
    surfaces: list[AirfieldSurface] | None = None,
    buffer_distance_override: float | None = None,
    require_perpendicular_runway_crossing: bool = True,
) -> list[WaypointData]:
    """A*-based rerouting of measurement waypoints around obstacles and safety zones.

    finds alternative positions that preserve measurement geometry (distance
    to center, line-of-sight to PAPI, max turn angle).
    """
    # find colliding waypoints
    collisions = [False] * len(waypoints)
    for i, wp in enumerate(waypoints):
        for obs in obstacles:
            buf = (
                buffer_distance_override
                if buffer_distance_override is not None
                else (obs.buffer_distance or 0.0)
            )
            if check_obstacle(db, wp, obs, buffer_distance=buf):
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
        max_buffer = _max_effective_buffer(obstacles, buffer_distance_override)
        search_radius = max_buffer * REROUTE_SEARCH_RADIUS_MULTIPLIER
        nearby_obs, nearby_zones = _collect_nearby_objects(
            obstacles,
            zones,
            mid_lon,
            mid_lat,
            search_radius,
            buffer_distance_override=buffer_distance_override,
        )

        # A* through local visibility graph (includes runway crossing penalties)
        path = _run_astar(
            db,
            from_pt,
            to_pt,
            nearby_obs,
            nearby_zones,
            surfaces,
            buffer_distance_override=buffer_distance_override,
            require_perpendicular_runway_crossing=require_perpendicular_runway_crossing,
        )
        if path is None:
            raise TrajectoryGenerationError("no obstacle-free reroute path found")

        # build rerouted waypoints (skip anchors at index 0 and -1)
        rerouted_wps = []
        for node in path[1:-1]:
            heading = bearing_between(node.lon, node.lat, center.lon, center.lat)
            pitch = elevation_angle(
                node.lon,
                node.lat,
                node.alt,
                center.lon,
                center.lat,
                center.alt,
            )

            rerouted_wps.append(
                WaypointData(
                    lon=node.lon,
                    lat=node.lat,
                    alt=node.alt,
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
            if not has_line_of_sight(db, wp_pt, center, nearby_obs, nearby_zones):
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
    db: Session,
    waypoints: list[WaypointData],
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
) -> None:
    """re-validate transit segments after altitude rewrite.

    after we rewrite transit altitudes to the cruise level, the segments
    could in principle cross an obstacle/zone that was fine at the old
    altitude. run a lightweight segment check and raise a clear error if
    the cruise level conflicts with obstacle clearance.
    """
    if not waypoints:
        return

    for k in range(1, len(waypoints)):
        prev, cur = waypoints[k - 1], waypoints[k]
        from_pt = Point3D(lon=prev.lon, lat=prev.lat, alt=prev.alt)
        to_pt = Point3D(lon=cur.lon, lat=cur.lat, alt=cur.alt)
        if _is_segment_blocked(db, from_pt, to_pt, obstacles, zones):
            raise TrajectoryGenerationError("cruise altitude conflicts with obstacle clearance")


def compute_transit_path(
    db: Session,
    from_point: Point3D,
    to_point: Point3D,
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    speed: MetersPerSecond,
    surfaces: list[AirfieldSurface] | None = None,
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
    # straight-line if path is clear and doesn't cross runway
    fast_path_buffer = buffer_distance_override if buffer_distance_override is not None else 0.0
    if not _is_segment_blocked(
        db, from_point, to_point, obstacles, zones, buffer_distance=fast_path_buffer
    ):
        crosses_runway = False
        if surfaces and require_perpendicular_runway_crossing:
            for surface in surfaces:
                crossing = segment_runway_crossing_length(
                    db,
                    from_point.lon,
                    from_point.lat,
                    to_point.lon,
                    to_point.lat,
                    surface,
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
            _check_cruise_clearance(db, wps, obstacles, zones)
            return wps

    # A* through visibility graph with runway penalties
    path = _run_astar(
        db,
        from_point,
        to_point,
        obstacles,
        zones,
        surfaces,
        buffer_distance_override=buffer_distance_override,
        require_perpendicular_runway_crossing=require_perpendicular_runway_crossing,
    )
    if path is None:
        raise TrajectoryGenerationError("no obstacle-free transit path found")

    # initial altitude = max of endpoints so drone never goes underground
    # when no elevation provider is available; overwritten below when it is.
    fallback_alt = max(from_point.alt, to_point.alt)

    # convert to TRANSIT waypoints (skip from_point at index 0)
    transit_wps = []
    for k in range(1, len(path)):
        prev, cur = path[k - 1], path[k]
        transit_wps.append(
            WaypointData(
                lon=cur.lon,
                lat=cur.lat,
                alt=fallback_alt,
                heading=bearing_between(prev.lon, prev.lat, cur.lon, cur.lat),
                speed=speed,
                waypoint_type=WaypointType.TRANSIT,
                camera_action=CameraAction.NONE,
            )
        )

    # if provider is available this replaces fallback_alt with ground+transit_agl
    _adjust_transit_altitude_for_terrain(transit_wps, elevation_provider, transit_agl)
    _check_cruise_clearance(db, transit_wps, obstacles, zones)

    return transit_wps
