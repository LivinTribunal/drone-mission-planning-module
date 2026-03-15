import heapq
import math

EARTH_RADIUS_M = 6371000.0


def distance_between(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """great-circle distance in meters between two WGS84 points (haversine)"""
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    # half-chord length squared
    half_chord = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )

    # angular distance in radians, then scale by earth radius
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(half_chord))


def bearing_between(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """initial bearing in degrees from point 1 to point 2 (0 = north, 90 = east)"""
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    delta_lon = math.radians(lon2 - lon1)

    # east-west and north-south components
    east = math.sin(delta_lon) * math.cos(lat2_rad)
    north = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(lat1_rad) * math.cos(
        lat2_rad
    ) * math.cos(delta_lon)

    return (math.degrees(math.atan2(east, north)) + 360) % 360


def point_at_distance(
    lon: float, lat: float, bearing_deg: float, distance_m: float
) -> tuple[float, float]:
    """point at given distance and bearing from start - returns (lon, lat)"""
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    brng_rad = math.radians(bearing_deg)

    # angular distance on earth's surface
    angular_dist = distance_m / EARTH_RADIUS_M

    # destination latitude
    dest_lat = math.asin(
        math.sin(lat_rad) * math.cos(angular_dist)
        + math.cos(lat_rad) * math.sin(angular_dist) * math.cos(brng_rad)
    )

    # destination longitude
    dest_lon = lon_rad + math.atan2(
        math.sin(brng_rad) * math.sin(angular_dist) * math.cos(lat_rad),
        math.cos(angular_dist) - math.sin(lat_rad) * math.sin(dest_lat),
    )

    return math.degrees(dest_lon), math.degrees(dest_lat)


def centroid(
    points: list[tuple[float, float, float]],
) -> tuple[float, float, float]:
    """arithmetic mean of 3D points - (lon, lat, alt)"""
    n = len(points)
    if n == 0:
        raise ValueError("no points for centroid")

    return (
        sum(p[0] for p in points) / n,
        sum(p[1] for p in points) / n,
        sum(p[2] for p in points) / n,
    )


def total_path_distance(
    points: list[tuple[float, float, float]],
) -> float:
    """total 3D distance along a path of (lon, lat, alt) points in meters"""
    total = 0.0
    for i in range(1, len(points)):
        ground_dist = distance_between(
            points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]
        )
        altitude_diff = points[i][2] - points[i - 1][2]
        total += math.sqrt(ground_dist**2 + altitude_diff**2)

    return total


def elevation_angle(
    from_lon: float,
    from_lat: float,
    from_alt: float,
    to_lon: float,
    to_lat: float,
    to_alt: float,
) -> float:
    """elevation angle in degrees from one 3D point to another (gimbal pitch)"""
    ground_dist = distance_between(from_lon, from_lat, to_lon, to_lat)
    altitude_diff = to_alt - from_alt

    if ground_dist == 0:
        return 90.0 if altitude_diff > 0 else -90.0

    return math.degrees(math.atan2(altitude_diff, ground_dist))


def angular_span_at_distance(
    points: list[tuple[float, float, float]],
    observer_lon: float,
    observer_lat: float,
) -> float:
    """angular span in degrees of a set of points as seen from observer"""
    if len(points) < 2:
        return 0.0

    bearings = [bearing_between(observer_lon, observer_lat, p[0], p[1]) for p in points]

    span = max(bearings) - min(bearings)

    # handle wrap-around (e.g. 350 to 10 degrees)
    if span > 180:
        span = 360 - span

    return span


# A* pathfinding on visibility graph
def astar(
    graph: dict[int, list[tuple[int, float]]],
    start: int,
    goal: int,
    positions: list[tuple[float, float, float]],
) -> list[int] | None:
    """A* shortest path - returns node index list or None if unreachable"""
    open_set = [(0.0, start)]
    came_from: dict[int, int] = {}
    g_score: dict[int, float] = {start: 0.0}

    while open_set:
        _, current = heapq.heappop(open_set)

        if current == goal:
            # reconstruct path
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)

            return list(reversed(path))

        for neighbor, edge_weight in graph.get(current, []):
            tentative_g = g_score[current] + edge_weight

            if tentative_g < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g

                # heuristic = geodesic distance to goal
                heuristic = distance_between(
                    positions[neighbor][0],
                    positions[neighbor][1],
                    positions[goal][0],
                    positions[goal][1],
                )
                heapq.heappush(open_set, (tentative_g + heuristic, neighbor))

    return None
