from sqlalchemy import func


def geojson_to_ewkt(geojson: dict) -> str:
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


def wkb_to_geojson(wkb_element, db) -> dict | None:
    if wkb_element is None:
        return None
    result = db.execute(func.ST_AsGeoJSON(wkb_element)).scalar()
    if result is None:
        return None
    import json

    return json.loads(result)
