"""export request/response schemas"""

from pydantic import BaseModel, field_validator

from app.models.enums import ExportFormat


class ExportRequest(BaseModel):
    """request body for export endpoint"""

    formats: list[str]

    @field_validator("formats")
    @classmethod
    def validate_formats(cls, v: list[str]) -> list[str]:
        """ensure at least one valid format is provided."""
        if not v:
            raise ValueError("at least one format is required")

        valid = {f.value for f in ExportFormat}
        for fmt in v:
            if fmt not in valid:
                raise ValueError(f"invalid format '{fmt}', must be one of {valid}")

        return list(dict.fromkeys(v))
