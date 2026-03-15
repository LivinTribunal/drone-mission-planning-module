from pydantic import BaseModel

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


def geojson_to_ewkt(geojson: dict) -> str:
    """convert GeoJSON dict to EWKT string"""
    coords = geojson["coordinates"]
    geom_type = geojson["type"]

    if geom_type == "Point":
        return f"SRID=4326;POINTZ({coords[0]} {coords[1]} {coords[2]})"

    if geom_type == "LineString":
        pts = ", ".join(f"{c[0]} {c[1]} {c[2]}" for c in coords)

        return f"SRID=4326;LINESTRINGZ({pts})"

    if geom_type == "Polygon":
        rings = []
        for ring in coords:
            pts = ", ".join(f"{c[0]} {c[1]} {c[2]}" for c in ring)
            rings.append(f"({pts})")

        return f"SRID=4326;POLYGONZ({', '.join(rings)})"

    raise ValueError(f"unsupported geometry type: {geom_type}")


def schema_to_model_data(schema: BaseModel) -> dict:
    """convert pydantic schema to dict with geometry fields as EWKT"""
    data = schema.model_dump()
    for key in GEOM_FIELDS & data.keys():
        if data[key] is not None:
            data[key] = geojson_to_ewkt(data[key])

    return data


def apply_schema_update(obj, schema: BaseModel):
    """apply pydantic update schema to ORM model, converting geometry to EWKT"""
    apply_dict_update(obj, schema.model_dump(exclude_unset=True))


def apply_dict_update(obj, data: dict):
    """apply dict to ORM model, converting geometry fields to EWKT"""
    for key, val in data.items():
        if key in GEOM_FIELDS and val is not None:
            setattr(obj, key, geojson_to_ewkt(val))
        else:
            setattr(obj, key, val)
