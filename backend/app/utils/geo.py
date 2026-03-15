import heapq
import math

EARTH_RADIUS_M = 6371000.0


def haversine(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """distance in meters between two WGS84 points"""
    r1, r2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = math.sin(dlat / 2) ** 2 + math.cos(r1) * math.cos(r2) * math.sin(dlon / 2) ** 2

    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bearing(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """bearing in degrees from point 1 to point 2"""
    r1, r2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)

    x = math.sin(dlon) * math.cos(r2)
    y = math.cos(r1) * math.sin(r2) - math.sin(r1) * math.cos(r2) * math.cos(dlon)

    return (math.degrees(math.atan2(x, y)) + 360) % 360


def destination_point(
    lon: float, lat: float, bearing_deg: float, distance_m: float
) -> tuple[float, float]:
    """point at given distance and bearing from start - returns (lon, lat)"""
    r1 = math.radians(lat)
    r_lon = math.radians(lon)
    brng = math.radians(bearing_deg)
    d = distance_m / EARTH_RADIUS_M

    r2 = math.asin(math.sin(r1) * math.cos(d) + math.cos(r1) * math.sin(d) * math.cos(brng))
    lon2 = r_lon + math.atan2(
        math.sin(brng) * math.sin(d) * math.cos(r1),
        math.cos(d) - math.sin(r1) * math.sin(r2),
    )

    return math.degrees(lon2), math.degrees(r2)


def centroid(
    points: list[tuple[float, float, float]],
) -> tuple[float, float, float]:
    """centroid of 3D points - (lon, lat, alt)"""
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
    """total 3D distance along a path of points in meters"""
    dist = 0.0
    for i in range(1, len(points)):
        h = haversine(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
        dz = points[i][2] - points[i - 1][2]
        dist += math.sqrt(h**2 + dz**2)

    return dist


def elevation_angle(
    from_lon: float,
    from_lat: float,
    from_alt: float,
    to_lon: float,
    to_lat: float,
    to_alt: float,
) -> float:
    """elevation angle in degrees from one 3D point to another (gimbal pitch)"""
    h_dist = haversine(from_lon, from_lat, to_lon, to_lat)
    dz = to_alt - from_alt

    if h_dist == 0:
        return 90.0 if dz > 0 else -90.0

    return math.degrees(math.atan2(dz, h_dist))


def angular_span_at_distance(
    points: list[tuple[float, float, float]],
    observer_lon: float,
    observer_lat: float,
) -> float:
    """angular span in degrees of a set of points as seen from observer"""
    if len(points) < 2:
        return 0.0

    bearings = [bearing(observer_lon, observer_lat, p[0], p[1]) for p in points]

    min_b = min(bearings)
    max_b = max(bearings)
    span = max_b - min_b

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
    """A* shortest path on a weighted graph - returns node indices or None"""
    open_set = [(0.0, start)]
    came_from: dict[int, int] = {}
    g_score: dict[int, float] = {start: 0.0}

    while open_set:
        _, current = heapq.heappop(open_set)

        if current == goal:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)

            return list(reversed(path))

        for neighbor, weight in graph.get(current, []):
            tentative = g_score[current] + weight

            if tentative < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative
                h = haversine(
                    positions[neighbor][0],
                    positions[neighbor][1],
                    positions[goal][0],
                    positions[goal][1],
                )
                heapq.heappush(open_set, (tentative + h, neighbor))

    return None
