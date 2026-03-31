from typing import Any

from geoalchemy2.elements import WKTElement
from pydantic import BaseModel

GeoJSON = dict[str, Any]
EWKT = str

# all geometry column names across the project
GEOM_FIELDS = {
    "location",
    "geometry",
    "position",
    "threshold_position",
    "end_position",
    "takeoff_coordinate",
    "landing_coordinate",
    "camera_target",
    "boundary",
}


def _fmt_coord(c: list) -> str:
    """format a single coordinate as 'x y z', defaulting z to 0 if missing."""
    if len(c) < 2:
        raise ValueError(f"coordinate must have at least 2 elements, got {len(c)}")
    z = c[2] if len(c) >= 3 else 0
    return f"{c[0]} {c[1]} {z}"


def geojson_to_ewkt(geojson: GeoJSON) -> EWKT:
    """convert GeoJSON dict to EWKT string"""
    coords = geojson["coordinates"]
    geom_type = geojson["type"]

    if geom_type == "Point":
        return f"SRID=4326;POINTZ({_fmt_coord(coords)})"

    if geom_type == "LineString":
        pts = ", ".join(_fmt_coord(c) for c in coords)

        return f"SRID=4326;LINESTRINGZ({pts})"

    if geom_type == "Polygon":
        rings = []
        for ring in coords:
            pts = ", ".join(_fmt_coord(c) for c in ring)
            rings.append(f"({pts})")

        return f"SRID=4326;POLYGONZ({', '.join(rings)})"

    raise ValueError(f"unsupported geometry type: {geom_type}")


def schema_to_model_data(schema: BaseModel) -> dict:
    """convert pydantic schema to dict with geometry fields as WKTElement"""
    data = schema.model_dump()
    for key in GEOM_FIELDS & data.keys():
        if data[key] is not None:
            data[key] = WKTElement(geojson_to_ewkt(data[key]), srid=4326)

    return data


def apply_schema_update(obj, schema: BaseModel):
    """apply pydantic update schema to ORM model, converting geometry to EWKT"""
    apply_dict_update(obj, schema.model_dump(exclude_unset=True))


def apply_dict_update(obj, data: dict):
    """apply dict to ORM model, converting geometry fields to WKTElement"""
    for key, val in data.items():
        if key in GEOM_FIELDS and val is not None:
            setattr(obj, key, WKTElement(geojson_to_ewkt(val), srid=4326))
        else:
            setattr(obj, key, val)
