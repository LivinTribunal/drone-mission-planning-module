"""export request/response schemas"""

from pydantic import BaseModel, field_validator

_VALID_FORMATS = {
    "KML",
    "KMZ",
    "JSON",
    "MAVLINK",
    "UGCS",
    "WPML",
    "CSV",
    "GPX",
    "LITCHI",
    "DRONEDEPLOY",
}

# formats that can carry keep-out polygons alongside waypoints.
# MAVLINK/JSON/UGCS enforce them at flight time; KMZ/KML are advisory-only
# (Pilot 2 renders the polygons but does not honor them in flight).
GEOZONE_CAPABLE_FORMATS = frozenset({"MAVLINK", "JSON", "UGCS", "KMZ", "KML"})

# subset that actually enforces at flight time (the rest are visual overlays)
GEOZONE_ENFORCED_FORMATS = frozenset({"MAVLINK", "JSON", "UGCS"})


class ExportRequest(BaseModel):
    """request body for export endpoint"""

    formats: list[str]
    include_geozones: bool = False
    include_runway_buffers: bool = False

    @field_validator("formats")
    @classmethod
    def validate_formats(cls, v: list[str]) -> list[str]:
        """ensure at least one valid format is provided."""
        if not v:
            raise ValueError("at least one format is required")

        for fmt in v:
            if fmt not in _VALID_FORMATS:
                raise ValueError(f"invalid format '{fmt}', must be one of {_VALID_FORMATS}")

        return list(dict.fromkeys(v))
