from pydantic import BaseModel


class PointZ(BaseModel):
    type: str = "Point"
    coordinates: list[float]  # [lon, lat, alt]


class LineStringZ(BaseModel):
    type: str = "LineString"
    coordinates: list[list[float]]


class PolygonZ(BaseModel):
    type: str = "Polygon"
    coordinates: list[list[list[float]]]
