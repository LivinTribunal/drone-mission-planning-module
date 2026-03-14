from pydantic import BaseModel


class PointZ(BaseModel):
    """point geometry schema"""

    type: str = "Point"
    coordinates: list[float]  # [lon, lat, alt]


class LineStringZ(BaseModel):
    """linestring geometry schema"""

    type: str = "LineString"
    coordinates: list[list[float]]


class PolygonZ(BaseModel):
    """polygon geometry schema"""

    type: str = "Polygon"
    coordinates: list[list[list[float]]]
