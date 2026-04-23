"""shared EWKT conversion helpers for postgis-backed validation."""

from __future__ import annotations

from app.core.exceptions import TrajectoryGenerationError
from app.schemas.geometry import parse_ewkb
from app.services.geometry_converter import geojson_to_ewkt


def _wp_to_ewkt(wp) -> str:
    """convert waypoint position to EWKT point string."""
    return geojson_to_ewkt({"type": "Point", "coordinates": [wp.lon, wp.lat, wp.alt]})


def _geom_to_ewkt(geom) -> str:
    """convert WKBElement to EWKT string for use in text() queries."""
    try:
        geojson = parse_ewkb(geom.data)
        return geojson_to_ewkt(geojson)
    except Exception as e:
        raise TrajectoryGenerationError(f"failed to parse geometry: {e}") from e
