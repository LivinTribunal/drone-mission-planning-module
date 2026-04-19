import logging
import math
import re
from typing import Any, cast

import httpx

from app.core.config import settings
from app.core.exceptions import DomainError, NotFoundError
from app.schemas.geometry import LineStringZ, PointZ, PolygonZ
from app.schemas.infrastructure import ObstacleTypeStr, SafetyZoneTypeStr
from app.schemas.openaip import (
    AirportLookupResponse,
    ObstacleSuggestion,
    RunwaySuggestion,
    SafetyZoneSuggestion,
)

logger = logging.getLogger(__name__)

_EARTH_RADIUS_M = 6371000.0


def _point_at_distance(
    lon: float, lat: float, bearing_deg: float, distance_m: float
) -> tuple[float, float]:
    """point at given distance and bearing from start - returns (lon, lat)."""
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    brng_rad = math.radians(bearing_deg)
    angular_dist = distance_m / _EARTH_RADIUS_M

    dest_lat = math.asin(
        math.sin(lat_rad) * math.cos(angular_dist)
        + math.cos(lat_rad) * math.sin(angular_dist) * math.cos(brng_rad)
    )
    dest_lon = lon_rad + math.atan2(
        math.sin(brng_rad) * math.sin(angular_dist) * math.cos(lat_rad),
        math.cos(angular_dist) - math.sin(lat_rad) * math.sin(dest_lat),
    )

    return math.degrees(dest_lon), math.degrees(dest_lat)


# search radius around airport for airspaces and obstacles
_NEARBY_RADIUS_KM = 25.0

# openaip airspace class codes - map to our SafetyZoneType enum
# source: openaip docs; the api exposes integer "type" codes.
# we map the common ones we care about; unmapped airspaces are skipped.
_AIRSPACE_TYPE_MAP: dict[int, str] = {
    # CTR
    4: "CTR",
    # restricted
    1: "RESTRICTED",
    # prohibited
    2: "PROHIBITED",
    # danger area - treat as restricted for safety
    3: "RESTRICTED",
    # TRA/TSA - treat as temporary no-fly
    21: "TEMPORARY_NO_FLY",
    22: "TEMPORARY_NO_FLY",
}

# openaip obstacle type codes - map to our ObstacleType enum.
# unmapped values fall back to OTHER.
_OBSTACLE_TYPE_MAP: dict[int, str] = {
    # building
    2: "BUILDING",
    # tower / mast / antenna family
    14: "TOWER",
    8: "ANTENNA",
    15: "ANTENNA",
    # vegetation / tree
    17: "VEGETATION",
}

# openaip unit codes (length / altitude)
# 0 = meters, 1 = feet, 2 = flight level, 6 = kilometers, 7 = nautical miles
_METERS_PER_FOOT = 0.3048
_METERS_PER_NM = 1852.0
_METERS_PER_KM = 1000.0

_ICAO_PATTERN = re.compile(r"^[A-Z]{4}$")


# unit conversion helpers
def _convert_length(value: float | None, unit: int | None) -> float | None:
    """convert a length value (openaip unit code) to meters."""
    if value is None:
        return None

    try:
        v = float(value)
    except (TypeError, ValueError):
        return None

    if unit is None or unit == 0:
        return v
    if unit == 1:
        return v * _METERS_PER_FOOT
    if unit == 6:
        return v * _METERS_PER_KM
    if unit == 7:
        return v * _METERS_PER_NM

    # unrecognized unit - log and treat as meters so callers can still see the value
    logger.warning("openaip: unrecognized length unit code %r; treating as meters", unit)
    return v


def _convert_altitude_limit(limit: dict | None) -> float | None:
    """convert an openaip altitude limit dict to meters above msl.

    openaip shape: {"value": <num>, "unit": <code>, "referenceDatum": <code>}
    - unit 2 (flight level) -> value * 100 ft -> meters
    - unit 1 (feet) -> meters
    - unit 0 or missing (meters) -> as-is
    returns None if value is missing or the unit code is unrecognized.
    """
    if not limit or "value" not in limit:
        return None

    value = limit.get("value")
    unit = limit.get("unit")
    if value is None:
        return None

    try:
        v = float(value)
    except (TypeError, ValueError):
        return None

    # absent unit defaults to meters - matches _convert_length behavior
    if unit is None or unit == 0:
        return v
    if unit == 2:
        # flight level - 1 FL = 100 ft
        return v * 100.0 * _METERS_PER_FOOT
    if unit == 1:
        return v * _METERS_PER_FOOT

    # unrecognized unit - safer to drop than silently mis-scale
    logger.warning("openaip: unrecognized altitude unit code %r; skipping limit", unit)
    return None


# type mappers
def _map_airspace_type(openaip_type: int | None) -> str | None:
    """map openaip airspace type code to SafetyZone type, or None if unmapped."""
    if openaip_type is None:
        return None

    return _AIRSPACE_TYPE_MAP.get(int(openaip_type))


def _map_obstacle_type(openaip_type: int | None) -> str:
    """map openaip obstacle type code to ObstacleType, default OTHER."""
    if openaip_type is None:
        return "OTHER"

    return _OBSTACLE_TYPE_MAP.get(int(openaip_type), "OTHER")


# geometry helpers
def _compute_runway_geometry(
    threshold_lat: float,
    threshold_lon: float,
    heading_deg: float,
    length_m: float,
    width_m: float,
    elevation_m: float,
) -> dict[str, Any]:
    """generate centerline, boundary, and end position from runway dimensions.

    returns a dict with LineStringZ geometry, PolygonZ boundary, and PointZ end_position.
    this is the inverse of AirfieldSurface.recalculate_dimensions().
    """
    # end position: project from threshold along heading for length meters
    end_lon, end_lat = _point_at_distance(threshold_lon, threshold_lat, heading_deg, length_m)

    # centerline
    geometry = LineStringZ(
        type="LineString",
        coordinates=[
            [threshold_lon, threshold_lat, elevation_m],
            [end_lon, end_lat, elevation_m],
        ],
    )

    # boundary: rectangle offsetting both endpoints by width/2 perpendicular
    half_w = width_m / 2.0
    left_bearing = (heading_deg - 90.0) % 360.0
    right_bearing = (heading_deg + 90.0) % 360.0

    t_left_lon, t_left_lat = _point_at_distance(threshold_lon, threshold_lat, left_bearing, half_w)
    t_right_lon, t_right_lat = _point_at_distance(
        threshold_lon, threshold_lat, right_bearing, half_w
    )
    e_left_lon, e_left_lat = _point_at_distance(end_lon, end_lat, left_bearing, half_w)
    e_right_lon, e_right_lat = _point_at_distance(end_lon, end_lat, right_bearing, half_w)

    # polygon ring: threshold-left -> end-left -> end-right -> threshold-right -> close
    boundary = PolygonZ(
        type="Polygon",
        coordinates=[
            [
                [t_left_lon, t_left_lat, elevation_m],
                [e_left_lon, e_left_lat, elevation_m],
                [e_right_lon, e_right_lat, elevation_m],
                [t_right_lon, t_right_lat, elevation_m],
                [t_left_lon, t_left_lat, elevation_m],
            ]
        ],
    )

    end_position = PointZ(type="Point", coordinates=[end_lon, end_lat, elevation_m])

    return {
        "geometry": geometry,
        "boundary": boundary,
        "end_position": end_position,
    }


def _generate_obstacle_boundary(
    lat: float, lon: float, elevation: float, radius_m: float = 3.0, vertices: int = 16
) -> PolygonZ:
    """generate a small circular polygon around an obstacle point."""
    coords = []
    for i in range(vertices):
        bearing = (360.0 * i) / vertices
        p_lon, p_lat = _point_at_distance(lon, lat, bearing, radius_m)
        coords.append([p_lon, p_lat, elevation])
    # close ring
    coords.append(coords[0])

    return PolygonZ(type="Polygon", coordinates=[coords])


# http client
def _client() -> httpx.Client:
    """build an httpx client with the configured timeout.

    raises DomainError(503) if no api key is configured.
    """
    if not settings.openaip_api_key:
        raise DomainError(
            "openaip api key not configured",
            status_code=503,
        )

    return httpx.Client(timeout=settings.openaip_request_timeout)


def _get(client: httpx.Client, path: str, params: dict | None = None) -> dict:
    """GET wrapper that injects auth header and maps errors to DomainError."""
    url = f"{settings.openaip_api_url.rstrip('/')}{path}"
    q = dict(params or {})
    headers = {"x-openaip-api-key": settings.openaip_api_key}

    try:
        resp = client.get(url, params=q, headers=headers)
    except httpx.TimeoutException as e:
        raise DomainError("openaip request timed out", status_code=502) from e
    except httpx.HTTPError as e:
        raise DomainError(f"openaip request failed: {e}", status_code=502) from e

    if resp.status_code == 404:
        raise NotFoundError("openaip resource not found")
    if resp.status_code == 401 or resp.status_code == 403:
        raise DomainError("openaip authentication failed", status_code=503)
    if resp.status_code >= 500:
        raise DomainError(f"openaip upstream error ({resp.status_code})", status_code=502)
    if resp.status_code >= 400:
        raise DomainError(f"openaip request rejected ({resp.status_code})", status_code=502)

    try:
        return resp.json()
    except ValueError as e:
        raise DomainError("openaip returned invalid json", status_code=502) from e


# response parsers
def _extract_point(geom: dict | None) -> tuple[float, float] | None:
    """extract (lon, lat) from a geojson Point geometry."""
    if not geom or geom.get("type") != "Point":
        return None

    coords = geom.get("coordinates") or []
    if len(coords) < 2:
        return None

    return float(coords[0]), float(coords[1])


def _extract_elevation(elev: dict | float | int | None) -> float | None:
    """extract an elevation value in meters from an openaip elevation field."""
    if elev is None:
        return None
    if isinstance(elev, (int, float)):
        return float(elev)
    if isinstance(elev, dict):
        return _convert_length(elev.get("value"), elev.get("unit"))

    return None


def _bearing_between(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """compute initial bearing (degrees) from point 1 to point 2."""
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    dlon_r = math.radians(lon2 - lon1)
    x = math.sin(dlon_r) * math.cos(lat2_r)
    y = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(dlon_r)
    return math.degrees(math.atan2(x, y)) % 360.0


def _distance_between(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """haversine distance in meters between two points."""
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = lat2_r - lat1_r
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    return _EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _parse_runway_from_dual_thresholds(
    designator: str,
    run_a: dict,
    run_b: dict,
    width_m: float,
    fallback_elevation: float,
) -> RunwaySuggestion | None:
    """build a runway suggestion from two runway direction (run) entries with threshold coords."""
    pt_a = _extract_point(run_a.get("thresholdLocation"))
    pt_b = _extract_point(run_b.get("thresholdLocation"))
    if pt_a is None or pt_b is None:
        return None

    lon_a, lat_a = pt_a
    lon_b, lat_b = pt_b

    heading = _bearing_between(lon_a, lat_a, lon_b, lat_b)
    length = _distance_between(lon_a, lat_a, lon_b, lat_b)

    if length < 1.0:
        return None

    geoms = _compute_runway_geometry(
        threshold_lat=lat_a,
        threshold_lon=lon_a,
        heading_deg=heading,
        length_m=length,
        width_m=width_m,
        elevation_m=fallback_elevation,
    )

    return RunwaySuggestion(
        identifier=str(designator),
        heading=heading,
        length=length,
        width=width_m,
        threshold_position=PointZ(
            type="Point",
            coordinates=[lon_a, lat_a, fallback_elevation],
        ),
        end_position=PointZ(
            type="Point",
            coordinates=[lon_b, lat_b, fallback_elevation],
        ),
        geometry=geoms["geometry"],
        boundary=geoms["boundary"],
    )


def _parse_runs(
    rw: dict,
    fallback_elevation: float,
) -> list[RunwaySuggestion]:
    """parse openaip runway with a `runs` array - one physical strip, two directions.

    when both runs have threshold locations, builds geometry directly from the two
    thresholds for maximum accuracy. falls back to single-run parsing otherwise.
    """
    runs = rw.get("runs") or []
    if len(runs) < 2:
        return []

    dimensions = rw.get("dimension") or {}
    width = _convert_length(
        (dimensions.get("width") or {}).get("value"),
        (dimensions.get("width") or {}).get("unit"),
    )
    if width is None:
        # try getting width from individual runs
        for run in runs:
            run_dim = run.get("dimension") or {}
            width = _convert_length(
                (run_dim.get("width") or {}).get("value"),
                (run_dim.get("width") or {}).get("unit"),
            )
            if width is not None:
                break
    if width is None:
        width = 45.0

    # check if both runs have threshold locations
    run_a, run_b = runs[0], runs[1]
    pt_a = _extract_point(run_a.get("thresholdLocation"))
    pt_b = _extract_point(run_b.get("thresholdLocation"))

    results: list[RunwaySuggestion] = []

    if pt_a is not None and pt_b is not None:
        # dual thresholds - build both directions from the exact positions
        des_a = run_a.get("designator") or run_a.get("name") or ""
        des_b = run_b.get("designator") or run_b.get("name") or ""
        designator = f"{des_a}/{des_b}" if des_a and des_b else (des_a or des_b)

        suggestion = _parse_runway_from_dual_thresholds(
            designator, run_a, run_b, width, fallback_elevation
        )
        if suggestion is not None:
            results.append(suggestion)
    else:
        # fall back to single-run parsing for each run that has enough data
        for run in runs:
            parsed = _parse_single_run(run, fallback_elevation, width_override=width)
            if parsed is not None:
                results.append(parsed)

    return results


def _parse_single_run(
    run: dict,
    fallback_elevation: float,
    airport_center: tuple[float, float] | None = None,
    width_override: float | None = None,
) -> RunwaySuggestion | None:
    """parse a single runway run/direction entry."""
    designator = run.get("designator") or run.get("name")
    dimensions = run.get("dimension") or {}
    length = _convert_length(
        (dimensions.get("length") or {}).get("value"),
        (dimensions.get("length") or {}).get("unit"),
    )
    width = width_override
    if width is None:
        width = _convert_length(
            (dimensions.get("width") or {}).get("value"),
            (dimensions.get("width") or {}).get("unit"),
        )

    heading_field = run.get("trueHeading")
    if heading_field is None:
        heading_field = run.get("heading")

    if not designator or length is None or width is None or heading_field is None:
        return None

    heading = float(heading_field)
    threshold = _extract_point(run.get("thresholdLocation") or run.get("location"))
    if threshold is None:
        if airport_center is None:
            return None
        center_lon, center_lat = airport_center
        back_bearing = (heading + 180.0) % 360.0
        threshold = _point_at_distance(center_lon, center_lat, back_bearing, float(length) / 2.0)

    threshold_lon, threshold_lat = threshold

    geoms = _compute_runway_geometry(
        threshold_lat=threshold_lat,
        threshold_lon=threshold_lon,
        heading_deg=heading,
        length_m=float(length),
        width_m=float(width),
        elevation_m=fallback_elevation,
    )

    return RunwaySuggestion(
        identifier=str(designator),
        heading=heading,
        length=float(length),
        width=float(width),
        threshold_position=PointZ(
            type="Point",
            coordinates=[threshold_lon, threshold_lat, fallback_elevation],
        ),
        end_position=geoms["end_position"],
        geometry=geoms["geometry"],
        boundary=geoms["boundary"],
    )


def _parse_runway(
    rw: dict,
    fallback_elevation: float,
    airport_center: tuple[float, float] | None = None,
) -> list[RunwaySuggestion]:
    """parse an openaip runway object into suggestions.

    openaip runways may contain a `runs` array with per-direction data including
    threshold locations. when both thresholds are available, geometry is built
    directly from them for maximum accuracy. otherwise falls back to projection.
    returns a list (possibly empty) of suggestions.
    """
    # try dual-threshold parsing via runs array first
    runs_results = _parse_runs(rw, fallback_elevation)
    if runs_results:
        return runs_results

    # legacy single-runway format
    result = _parse_single_run(rw, fallback_elevation, airport_center=airport_center)
    if result is not None:
        return [result]

    return []


def _parse_polygon_geometry(geom: dict | None, default_z: float = 0.0) -> PolygonZ | None:
    """parse an openaip polygon geometry (2d or 3d) into a PolygonZ with Z coordinates."""
    if not geom or geom.get("type") != "Polygon":
        return None

    rings = geom.get("coordinates") or []
    if not rings:
        return None

    out_rings: list[list[list[float]]] = []
    for ring in rings:
        # geojson/postgis linear rings need >=4 positions (3 unique + closing repeat)
        if len(ring) < 4:
            return None

        new_ring: list[list[float]] = []
        for c in ring:
            if len(c) < 2:
                return None
            lon = float(c[0])
            lat = float(c[1])
            z = float(c[2]) if len(c) >= 3 else default_z
            new_ring.append([lon, lat, z])

        # ensure ring is closed
        if new_ring[0] != new_ring[-1]:
            new_ring.append(list(new_ring[0]))

        out_rings.append(new_ring)

    return PolygonZ(type="Polygon", coordinates=out_rings)


def _parse_airspace(item: dict) -> SafetyZoneSuggestion | None:
    """parse an openaip airspace into a SafetyZoneSuggestion, or None if unmapped."""
    mapped = _map_airspace_type(item.get("type"))
    if mapped is None:
        return None

    polygon = _parse_polygon_geometry(item.get("geometry"))
    if polygon is None:
        return None

    name = item.get("name") or "Airspace"
    floor = _convert_altitude_limit(item.get("lowerLimit"))
    ceiling = _convert_altitude_limit(item.get("upperLimit"))

    return SafetyZoneSuggestion(
        name=str(name),
        type=cast(SafetyZoneTypeStr, mapped),
        geometry=polygon,
        altitude_floor=floor,
        altitude_ceiling=ceiling,
    )


def _parse_obstacle(item: dict, fallback_elevation: float) -> ObstacleSuggestion | None:
    """parse an openaip obstacle into a suggestion, or None if incomplete."""
    point = _extract_point(item.get("geometry"))
    if point is None:
        return None

    lon, lat = point
    elevation = _extract_elevation(item.get("elevation")) or fallback_elevation
    height_field = item.get("height") or {}
    height = _convert_length(height_field.get("value"), height_field.get("unit"))
    if height is None:
        height = 0.0

    mapped = _map_obstacle_type(item.get("type"))
    name = item.get("name") or f"Obstacle ({mapped.lower()})"

    return ObstacleSuggestion(
        name=str(name),
        type=cast(ObstacleTypeStr, mapped),
        height=float(height),
        boundary=_generate_obstacle_boundary(lat, lon, elevation),
    )


# public api
def lookup_airport_by_icao(icao_code: str, radius_km: float = 3.0) -> AirportLookupResponse:
    """fetch airport + nearby airspaces + nearby obstacles for an icao code.

    raises NotFoundError if no airport matches the icao code.
    raises DomainError(503) when api key is missing / auth fails.
    raises DomainError(502) on upstream failures.
    """
    icao = (icao_code or "").strip().upper()
    if not _ICAO_PATTERN.match(icao):
        raise DomainError(
            "icao_code must be exactly 4 uppercase letters",
            status_code=400,
        )

    with _client() as client:
        # search airports by icao
        search = _get(
            client,
            "/airports",
            params={"search": icao, "searchOptLwc": "true", "limit": 10},
        )
        items = _extract_items(search)
        airport = _pick_matching_airport(items, icao)
        if airport is None:
            raise NotFoundError(f"no airport found for ICAO {icao}")

        location = _extract_point(airport.get("geometry"))
        if location is None:
            raise DomainError("openaip airport is missing coordinates", status_code=502)

        lon, lat = location
        elevation = _extract_elevation(airport.get("elevation")) or 0.0

        runways_raw = airport.get("runways") or []
        runways: list[RunwaySuggestion] = []
        for rw in runways_raw:
            runways.extend(_parse_runway(rw, elevation, airport_center=(lon, lat)))

        airspaces = _fetch_nearby_airspaces(client, lat, lon, radius_km)
        obstacles = _fetch_nearby_obstacles(client, lat, lon, radius_km, elevation)

    return AirportLookupResponse(
        icao_code=icao,
        name=str(airport.get("name") or icao),
        city=airport.get("city") or None,
        country=airport.get("country") or None,
        elevation=float(elevation),
        location=PointZ(type="Point", coordinates=[lon, lat, float(elevation)]),
        runways=runways,
        obstacles=obstacles,
        safety_zones=airspaces,
    )


def _extract_items(payload: Any) -> list[dict]:
    """extract the list of items from an openaip list response, tolerating shapes."""
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]

    if isinstance(payload, dict):
        for key in ("items", "data", "results"):
            v = payload.get(key)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]

    return []


def _pick_matching_airport(items: list[dict], icao: str) -> dict | None:
    """choose the airport whose icao code matches exactly, or None if no match."""
    for item in items:
        code = (item.get("icaoCode") or item.get("icao") or "").upper()
        if code == icao:
            return item

    if items:
        # openaip search is fuzzy - returning the first result risks pre-filling the
        # form with the wrong airport. log and let the caller raise NotFoundError.
        logger.warning(
            "openaip: no exact icao match for %s; %d unrelated result(s) discarded",
            icao,
            len(items),
        )

    return None


def _fetch_nearby_airspaces(
    client: httpx.Client, lat: float, lon: float, radius_km: float
) -> list[SafetyZoneSuggestion]:
    """fetch airspaces near a point and parse mapped ones."""
    try:
        payload = _get(
            client,
            "/airspaces",
            params={"pos": f"{lat},{lon}", "dist": radius_km * _METERS_PER_KM, "limit": 100},
        )
    except DomainError as e:
        logger.warning("openaip airspace fetch failed: %s", e)
        return []
    except NotFoundError:
        return []

    out: list[SafetyZoneSuggestion] = []
    for item in _extract_items(payload):
        parsed = _parse_airspace(item)
        if parsed is not None:
            out.append(parsed)

    return out


def _fetch_nearby_obstacles(
    client: httpx.Client,
    lat: float,
    lon: float,
    radius_km: float,
    airport_elevation: float,
) -> list[ObstacleSuggestion]:
    """fetch obstacles near a point and parse them."""
    try:
        payload = _get(
            client,
            "/obstacles",
            params={"pos": f"{lat},{lon}", "dist": radius_km * _METERS_PER_KM, "limit": 100},
        )
    except DomainError as e:
        logger.warning("openaip obstacle fetch failed: %s", e)
        return []
    except NotFoundError:
        return []

    out: list[ObstacleSuggestion] = []
    for item in _extract_items(payload):
        parsed = _parse_obstacle(item, airport_elevation)
        if parsed is not None:
            out.append(parsed)

    return out


__all__ = [
    "lookup_airport_by_icao",
]
