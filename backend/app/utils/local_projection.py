"""equirectangular projection + WGS84-to-Shapely conversion utilities."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import TYPE_CHECKING

from shapely.geometry import LineString, Point, Polygon

from app.schemas.geometry import parse_ewkb

if TYPE_CHECKING:
    from app.models.airport import AirfieldSurface, Obstacle, SafetyZone

logger = logging.getLogger(__name__)

EARTH_RADIUS_M = 6_371_000.0


class LocalProjection:
    """equirectangular projection centered on airport reference point."""

    def __init__(self, ref_lon: float, ref_lat: float):
        """initialize projection centered on (ref_lon, ref_lat)."""
        self.ref_lon = ref_lon
        self.ref_lat = ref_lat
        self._cos_ref_lat = math.cos(math.radians(ref_lat))

    def to_local(self, lon: float, lat: float) -> tuple[float, float]:
        """convert WGS84 (lon, lat) to local meter coordinates (x, y)."""
        x = math.radians(lon - self.ref_lon) * EARTH_RADIUS_M * self._cos_ref_lat
        y = math.radians(lat - self.ref_lat) * EARTH_RADIUS_M
        return x, y

    def to_wgs84(self, x: float, y: float) -> tuple[float, float]:
        """convert local meter coordinates (x, y) back to WGS84 (lon, lat)."""
        lon = self.ref_lon + math.degrees(x / (EARTH_RADIUS_M * self._cos_ref_lat))
        lat = self.ref_lat + math.degrees(y / EARTH_RADIUS_M)
        return lon, lat

    def point_to_local(self, lon: float, lat: float) -> Point:
        """convert WGS84 to Shapely Point in local coordinates."""
        x, y = self.to_local(lon, lat)
        return Point(x, y)

    def line_to_local(self, lon1: float, lat1: float, lon2: float, lat2: float) -> LineString:
        """convert WGS84 segment to Shapely LineString in local coordinates."""
        return LineString([self.to_local(lon1, lat1), self.to_local(lon2, lat2)])


# local-coordinate geometry containers for Shapely-based pathfinding


@dataclass
class LocalObstacle:
    """obstacle polygon in local meter coordinates."""

    polygon: Polygon
    name: str
    height: float
    base_alt: float
    buffer_distance: float


@dataclass
class LocalZone:
    """safety zone polygon in local meter coordinates."""

    polygon: Polygon
    zone_type: str
    name: str
    altitude_floor: float | None
    altitude_ceiling: float | None


@dataclass
class LocalBoundary:
    """airport boundary polygon in local meter coordinates."""

    polygon: Polygon
    name: str


@dataclass
class LocalSurface:
    """runway/taxiway buffered centerline in local meter coordinates."""

    polygon: Polygon
    centerline: LineString
    identifier: str
    surface_type: str
    width: float
    length: float
    heading: float | None


@dataclass
class LocalGeometries:
    """all spatial geometry in local meter coordinates for pathfinding."""

    proj: LocalProjection
    obstacles: list[LocalObstacle]
    zones: list[LocalZone]
    boundary_zones: list[LocalBoundary]
    surfaces: list[LocalSurface]


def ewkb_to_local_polygon(proj: LocalProjection, ewkb_data: bytes) -> Polygon | None:
    """convert EWKB polygon to Shapely Polygon in local coordinates."""
    try:
        geojson = parse_ewkb(ewkb_data)
    except (ValueError, KeyError, TypeError, IndexError):
        return None

    if geojson.get("type") != "Polygon":
        return None

    coords = geojson.get("coordinates")
    if not coords or not coords[0]:
        return None

    exterior = [proj.to_local(c[0], c[1]) for c in coords[0]]

    holes = []
    for ring in coords[1:]:
        holes.append([proj.to_local(c[0], c[1]) for c in ring])

    try:
        poly = Polygon(exterior, holes)
        if poly.is_empty or not poly.is_valid:
            return None
        return poly
    except Exception as exc:
        logger.warning("failed to build local polygon: %s", exc)
        return None


def ewkb_to_local_linestring(proj: LocalProjection, ewkb_data: bytes) -> LineString | None:
    """convert EWKB linestring to Shapely LineString in local coordinates."""
    try:
        geojson = parse_ewkb(ewkb_data)
    except (ValueError, KeyError, TypeError, IndexError):
        return None

    if geojson.get("type") != "LineString":
        return None

    coords = geojson.get("coordinates")
    if not coords or len(coords) < 2:
        return None

    local_coords = [proj.to_local(c[0], c[1]) for c in coords]
    try:
        ls = LineString(local_coords)
        if ls.is_empty:
            return None
        return ls
    except Exception as exc:
        logger.warning("failed to build local linestring: %s", exc)
        return None


def obstacle_base_altitude_from_ewkb(ewkb_data: bytes) -> float:
    """extract base altitude from obstacle boundary centroid z-coordinate."""
    try:
        geojson = parse_ewkb(ewkb_data)
        coords = geojson.get("coordinates", [[]])[0]
        if coords:
            alts = [c[2] for c in coords if len(c) > 2]
            return min(alts) if alts else 0.0
    except (IndexError, KeyError, ValueError):
        pass
    return 0.0


def build_local_geometries(
    proj: LocalProjection,
    obstacles: list[Obstacle],
    zones: list[SafetyZone],
    surfaces: list[AirfieldSurface],
) -> LocalGeometries:
    """build LocalGeometries from ORM objects and a projection."""
    from app.models.enums import SafetyZoneType

    local_obstacles = []
    for obs in obstacles:
        if not obs.boundary:
            continue
        poly = ewkb_to_local_polygon(proj, obs.boundary.data)
        if poly is None:
            logger.error("obstacle %s skipped - geometry could not be parsed", obs.name)
            continue
        base_alt = obstacle_base_altitude_from_ewkb(obs.boundary.data)
        local_obstacles.append(
            LocalObstacle(
                polygon=poly,
                name=obs.name or "",
                height=obs.height or 0.0,
                base_alt=base_alt,
                buffer_distance=obs.buffer_distance or 0.0,
            )
        )

    local_zones = []
    local_boundaries = []
    for zone in zones:
        if not zone.geometry:
            continue
        poly = ewkb_to_local_polygon(proj, zone.geometry.data)
        if poly is None:
            logger.error("safety zone %s skipped - geometry could not be parsed", zone.name)
            continue

        if zone.type == SafetyZoneType.AIRPORT_BOUNDARY.value:
            local_boundaries.append(
                LocalBoundary(
                    polygon=poly,
                    name=zone.name or "",
                )
            )
        else:
            local_zones.append(
                LocalZone(
                    polygon=poly,
                    zone_type=zone.type,
                    name=zone.name or "",
                    altitude_floor=zone.altitude_floor,
                    altitude_ceiling=zone.altitude_ceiling,
                )
            )

    local_surfaces = []
    for surface in surfaces:
        if not surface.geometry:
            continue
        ls = ewkb_to_local_linestring(proj, surface.geometry.data)
        if ls is None:
            logger.error("surface %s skipped - geometry could not be parsed", surface.name)
            continue
        half_width = (surface.width or 45.0) / 2.0
        runway_poly = ls.buffer(half_width, cap_style="flat")

        local_surfaces.append(
            LocalSurface(
                polygon=runway_poly,
                centerline=ls,
                identifier=surface.identifier or "",
                surface_type=surface.surface_type or "",
                width=surface.width or 45.0,
                length=surface.length or ls.length,
                heading=surface.heading,
            )
        )

    return LocalGeometries(
        proj=proj,
        obstacles=local_obstacles,
        zones=local_zones,
        boundary_zones=local_boundaries,
        surfaces=local_surfaces,
    )
