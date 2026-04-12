import logging
from typing import Any

import httpx

from app.core.config import settings
from app.core.exceptions import DomainError, NotFoundError
from app.schemas.geometry import LineStringZ, PointZ, PolygonZ
from app.schemas.openaip import (
    AirportLookupResponse,
    ObstacleSuggestion,
    RunwaySuggestion,
    SafetyZoneSuggestion,
)
from app.utils.geo import point_at_distance

logger = logging.getLogger(__name__)

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


# unit conversion helpers
def _convert_length(value: float | None, unit: int | None) -> float | None:
    """convert a length value (openaip unit code) to meters."""
    if value is None:
        return None

    if unit is None or unit == 0:
        return float(value)
    if unit == 1:
        return float(value) * _METERS_PER_FOOT
    if unit == 6:
        return float(value) * _METERS_PER_KM
    if unit == 7:
        return float(value) * _METERS_PER_NM

    return float(value)


def _convert_altitude_limit(limit: dict | None) -> float | None:
    """convert an openaip altitude limit dict to meters above msl.

    openaip shape: {"value": <num>, "unit": <code>, "referenceDatum": <code>}
    - unit 2 (flight level) -> value * 100 ft -> meters
    - unit 1 (feet) -> meters
    - unit 0 (meters) -> as-is
    returns None if shape is missing or unrecognized.
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

    if unit == 2:
        # flight level - 1 FL = 100 ft
        return v * 100.0 * _METERS_PER_FOOT
    if unit == 1:
        return v * _METERS_PER_FOOT
    if unit == 0:
        return v

    return v


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
    end_lon, end_lat = point_at_distance(threshold_lon, threshold_lat, heading_deg, length_m)

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

    t_left_lon, t_left_lat = point_at_distance(threshold_lon, threshold_lat, left_bearing, half_w)
    t_right_lon, t_right_lat = point_at_distance(
        threshold_lon, threshold_lat, right_bearing, half_w
    )
    e_left_lon, e_left_lat = point_at_distance(end_lon, end_lat, left_bearing, half_w)
    e_right_lon, e_right_lat = point_at_distance(end_lon, end_lat, right_bearing, half_w)

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
        p_lon, p_lat = point_at_distance(lon, lat, bearing, radius_m)
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
    """GET wrapper that injects apiKey and maps errors to DomainError."""
    url = f"{settings.openaip_api_url.rstrip('/')}{path}"
    q = dict(params or {})
    q["apiKey"] = settings.openaip_api_key

    try:
        resp = client.get(url, params=q)
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


def _parse_runway(rw: dict, fallback_elevation: float) -> RunwaySuggestion | None:
    """parse a single openaip runway into a suggestion, returning None if incomplete."""
    designator = rw.get("designator") or rw.get("name")
    dimensions = rw.get("dimension") or {}
    length = _convert_length(
        (dimensions.get("length") or {}).get("value"),
        (dimensions.get("length") or {}).get("unit"),
    )
    width = _convert_length(
        (dimensions.get("width") or {}).get("value"),
        (dimensions.get("width") or {}).get("unit"),
    )
    heading_field = rw.get("trueHeading")
    if heading_field is None:
        heading_field = rw.get("heading")

    threshold = _extract_point(rw.get("thresholdLocation") or rw.get("location"))

    if not designator or length is None or width is None or heading_field is None:
        return None
    if threshold is None:
        return None

    threshold_lon, threshold_lat = threshold
    heading = float(heading_field)

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


def _parse_polygon_geometry(geom: dict | None, default_z: float = 0.0) -> PolygonZ | None:
    """parse an openaip polygon geometry (2d or 3d) into a PolygonZ with Z coordinates."""
    if not geom or geom.get("type") != "Polygon":
        return None

    rings = geom.get("coordinates") or []
    if not rings:
        return None

    out_rings: list[list[list[float]]] = []
    for ring in rings:
        if len(ring) < 3:
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
        type=mapped,  # type: ignore[arg-type]
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
        type=mapped,  # type: ignore[arg-type]
        height=float(height),
        boundary=_generate_obstacle_boundary(lat, lon, elevation),
    )


# public api
def lookup_airport_by_icao(icao_code: str) -> AirportLookupResponse:
    """fetch airport + nearby airspaces + nearby obstacles for an icao code.

    raises NotFoundError if no airport matches the icao code.
    raises DomainError(503) when api key is missing / auth fails.
    raises DomainError(502) on upstream failures.
    """
    icao = (icao_code or "").strip().upper()
    if not icao:
        raise DomainError("icao_code is required", status_code=400)

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
            parsed = _parse_runway(rw, elevation)
            if parsed is not None:
                runways.append(parsed)

        airspaces = _fetch_nearby_airspaces(client, lat, lon, _NEARBY_RADIUS_KM)
        obstacles = _fetch_nearby_obstacles(client, lat, lon, _NEARBY_RADIUS_KM, elevation)

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
    """choose the airport whose icao code matches exactly, falling back to first."""
    for item in items:
        code = (item.get("icaoCode") or item.get("icao") or "").upper()
        if code == icao:
            return item

    return items[0] if items else None


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


# re-exports for convenience in tests
__all__ = [
    "AirportLookupResponse",
    "lookup_airport_by_icao",
    "_compute_runway_geometry",
    "_generate_obstacle_boundary",
    "_map_airspace_type",
    "_map_obstacle_type",
    "_convert_length",
    "_convert_altitude_limit",
    "_parse_runway",
    "_parse_airspace",
    "_parse_obstacle",
]
