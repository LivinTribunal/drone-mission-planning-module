from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import FocusDistanceModeStr, FocusModeStr, ListMeta, WhiteBalanceStr


class CameraPresetCreate(BaseModel):
    """create camera preset."""

    name: str = Field(max_length=100)
    drone_profile_id: UUID | None = None
    is_default: bool = False
    white_balance: WhiteBalanceStr | None = None
    iso: int | None = Field(default=None, gt=0)
    shutter_speed: str | None = Field(default=None, max_length=20)
    focus_mode: FocusModeStr | None = None
    focus_distance_mode: FocusDistanceModeStr | None = None
    optical_zoom: float | None = Field(default=None, gt=0)


class CameraPresetUpdate(BaseModel):
    """update camera preset."""

    name: str | None = Field(default=None, max_length=100)
    drone_profile_id: UUID | None = None
    is_default: bool | None = None
    white_balance: WhiteBalanceStr | None = None
    iso: int | None = Field(default=None, gt=0)
    shutter_speed: str | None = Field(default=None, max_length=20)
    focus_mode: FocusModeStr | None = None
    focus_distance_mode: FocusDistanceModeStr | None = None
    optical_zoom: float | None = Field(default=None, gt=0)


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
    focus_distance_mode: FocusDistanceModeStr | None = None
    optical_zoom: float | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CameraPresetListResponse(BaseModel):
    """camera preset list response."""

    data: list[CameraPresetResponse]
    meta: ListMeta
