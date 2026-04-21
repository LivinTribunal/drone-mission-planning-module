from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import FocusModeStr, ListMeta, WhiteBalanceStr


class CameraPresetCreate(BaseModel):
    """create camera preset."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(max_length=100)
    drone_profile_id: UUID | None = None
    is_default: bool = False
    white_balance: WhiteBalanceStr | None = None
    iso: int | None = Field(default=None, gt=0)
    shutter_speed: str | None = Field(default=None, max_length=20)
    focus_mode: FocusModeStr | None = None


class CameraPresetUpdate(BaseModel):
    """update camera preset. at least one field must be provided."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=100)
    drone_profile_id: UUID | None = None
    is_default: bool | None = None
    white_balance: WhiteBalanceStr | None = None
    iso: int | None = Field(default=None, gt=0)
    shutter_speed: str | None = Field(default=None, max_length=20)
    focus_mode: FocusModeStr | None = None

    @model_validator(mode="after")
    def _require_any_field(self) -> "CameraPresetUpdate":
        """reject PUT requests that provide no fields to change."""
        if not self.model_fields_set:
            raise ValueError("at least one field must be provided")
        return self


class CameraPresetResponse(BaseModel):
    """camera preset response."""

    id: UUID
    name: str
    drone_profile_id: UUID | None = None
    created_by: UUID | None = None
    is_default: bool = False
    white_balance: WhiteBalanceStr | None = None
    iso: int | None = None
    shutter_speed: str | None = None
    focus_mode: FocusModeStr | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CameraPresetListResponse(BaseModel):
    """camera preset list response."""

    data: list[CameraPresetResponse]
    meta: ListMeta
