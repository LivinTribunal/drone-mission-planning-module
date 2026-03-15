import struct

from geoalchemy2.elements import WKBElement
from pydantic import BaseModel, model_validator


def _ensure_bytes(data) -> bytes:
    """convert hex string or memoryview to bytes"""
    if isinstance(data, (bytes, memoryview)):
        return bytes(data)
    if isinstance(data, str):
        return bytes.fromhex(data)

    raise ValueError(f"unexpected WKB data type: {type(data)}")


def parse_ewkb(data) -> dict:
    """parse EWKB binary to GeoJSON dict - handles POINTZ, LINESTRINGZ, POLYGONZ"""
    raw = _ensure_bytes(data)
    offset = 0

    byte_order = raw[offset]
    offset += 1
    fmt = "<" if byte_order == 1 else ">"

    type_int = struct.unpack_from(f"{fmt}I", raw, offset)[0]
    offset += 4

    has_z = bool(type_int & 0x80000000)
    has_srid = bool(type_int & 0x20000000)
    geom_type = type_int & 0xFF

    if has_srid:
        offset += 4

    dim = 3 if has_z else 2

    def read_point():
        nonlocal offset
        coords = list(struct.unpack_from(f"{fmt}{dim}d", raw, offset))
        offset += dim * 8

        return coords[:3]

    # point
    if geom_type == 1:
        return {"type": "Point", "coordinates": read_point()}

    # linestring
    if geom_type == 2:
        n = struct.unpack_from(f"{fmt}I", raw, offset)[0]
        offset += 4

        return {"type": "LineString", "coordinates": [read_point() for _ in range(n)]}

    # polygon
    if geom_type == 3:
        n_rings = struct.unpack_from(f"{fmt}I", raw, offset)[0]
        offset += 4
        rings = []

        for _ in range(n_rings):
            n_pts = struct.unpack_from(f"{fmt}I", raw, offset)[0]
            offset += 4
            rings.append([read_point() for _ in range(n_pts)])

        return {"type": "Polygon", "coordinates": rings}

    raise ValueError(f"unsupported geometry type: {geom_type}")


class PointZ(BaseModel):
    """point geometry schema"""

    type: str = "Point"
    coordinates: list[float]  # [lon, lat, alt]

    @model_validator(mode="before")
    @classmethod
    def from_wkb(cls, data):
        if isinstance(data, WKBElement):
            return parse_ewkb(data.data)

        return data


class LineStringZ(BaseModel):
    """linestring geometry schema"""

    type: str = "LineString"
    coordinates: list[list[float]]

    @model_validator(mode="before")
    @classmethod
    def from_wkb(cls, data):
        if isinstance(data, WKBElement):
            return parse_ewkb(data.data)

        return data


class PolygonZ(BaseModel):
    """polygon geometry schema"""

    type: str = "Polygon"
    coordinates: list[list[list[float]]]

    @model_validator(mode="before")
    @classmethod
    def from_wkb(cls, data):
        if isinstance(data, WKBElement):
            return parse_ewkb(data.data)

        return data
