from geoalchemy2.elements import WKBElement
from pydantic import BaseModel, field_validator, model_validator

from app.core.geometry import parse_ewkb as parse_ewkb  # noqa: F401


class PointZ(BaseModel):
    """point geometry schema"""

    type: str = "Point"
    coordinates: list[float]  # [lon, lat, alt]

    @field_validator("coordinates")
    @classmethod
    def must_have_z(cls, v: list[float]) -> list[float]:
        """coordinates must have at least 3 elements (lon, lat, alt)."""
        if len(v) < 3:
            raise ValueError("PointZ coordinates must have at least 3 elements [lon, lat, alt]")
        return v

    @model_validator(mode="before")
    @classmethod
    def from_wkb(cls, data):
        """parse WKBElement to geojson dict."""
        if isinstance(data, WKBElement):
            return parse_ewkb(data.data)

        return data


class LineStringZ(BaseModel):
    """linestring geometry schema"""

    type: str = "LineString"
    coordinates: list[list[float]]

    @field_validator("coordinates")
    @classmethod
    def must_have_z(cls, v: list[list[float]]) -> list[list[float]]:
        """each coordinate must have at least 3 elements."""
        for i, c in enumerate(v):
            if len(c) < 3:
                raise ValueError(
                    f"LineStringZ coordinate at index {i} must have at least 3 elements"
                )
        return v

    @model_validator(mode="before")
    @classmethod
    def from_wkb(cls, data):
        """parse WKBElement to geojson dict."""
        if isinstance(data, WKBElement):
            return parse_ewkb(data.data)

        return data


class PolygonZ(BaseModel):
    """polygon geometry schema"""

    type: str = "Polygon"
    coordinates: list[list[list[float]]]

    @field_validator("coordinates")
    @classmethod
    def must_have_z(cls, v: list[list[list[float]]]) -> list[list[list[float]]]:
        """each coordinate in each ring must have at least 3 elements and rings must be closed."""
        for ri, ring in enumerate(v):
            for ci, c in enumerate(ring):
                if len(c) < 3:
                    raise ValueError(
                        f"PolygonZ ring {ri} coordinate at index {ci} must have at least 3 elements"
                    )

            if len(ring) >= 2 and ring[0] != ring[-1]:
                raise ValueError(
                    f"PolygonZ ring {ri} is not closed - first and last coordinates must match"
                )

        return v

    @model_validator(mode="before")
    @classmethod
    def from_wkb(cls, data):
        """parse WKBElement to geojson dict."""
        if isinstance(data, WKBElement):
            return parse_ewkb(data.data)

        return data
