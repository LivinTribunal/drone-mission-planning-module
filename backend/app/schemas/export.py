"""export request/response schemas"""

from pydantic import BaseModel, field_validator

_VALID_FORMATS = {"KML", "KMZ", "JSON", "MAVLINK"}


class ExportRequest(BaseModel):
    """request body for export endpoint"""

    formats: list[str]

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
