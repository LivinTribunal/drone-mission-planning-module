from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ListMeta
from app.schemas.mission import (
    CaptureModeStr,
    FocusModeStr,
    HoverBearingRefStr,
    InspectionMethodStr,
    WhiteBalanceStr,
)


class InspectionConfigCreate(BaseModel):
    """inspection config create schema"""

    altitude_offset: float | None = None
    measurement_speed_override: float | None = Field(default=None, gt=0)
    measurement_density: int | None = None
    custom_tolerances: dict | None = None
    hover_duration: float | None = None
    horizontal_distance: float | None = None
    sweep_angle: float | None = None
    vertical_profile_height: float | None = Field(default=None, gt=0)
    lha_ids: list[UUID] | None = None
    capture_mode: CaptureModeStr | None = None
    recording_setup_duration: float | None = None
    buffer_distance: float | None = Field(default=None, ge=0)
    height_above_lights: float | None = Field(default=None, gt=0)
    lateral_offset: float | None = Field(default=None, gt=0)
    distance_from_lha: float | None = Field(default=None, gt=0)
    height_above_lha: float | None = Field(default=None, gt=0)
    camera_gimbal_angle: float | None = None
    selected_lha_id: UUID | None = None
    lha_setting_angle_override_id: UUID | None = None
    hover_bearing: float | None = None
    hover_bearing_reference: HoverBearingRefStr | None = None
    white_balance: WhiteBalanceStr | None = None
    iso: int | None = Field(default=None, gt=0)
    shutter_speed: str | None = Field(default=None, max_length=20)
    focus_mode: FocusModeStr | None = None
    optical_zoom: float | None = Field(default=None, gt=0)
    camera_preset_id: UUID | None = None


class InspectionConfigResponse(BaseModel):
    """inspection config response schema"""

    id: UUID
    altitude_offset: float | None = None
    measurement_speed_override: float | None = None
    measurement_density: int | None = None
    custom_tolerances: dict | None = None
    hover_duration: float | None = None
    horizontal_distance: float | None = None
    sweep_angle: float | None = None
    vertical_profile_height: float | None = None
    lha_ids: list[UUID] | None = None
    capture_mode: CaptureModeStr | None = None
    recording_setup_duration: float | None = None
    buffer_distance: float | None = None
    height_above_lights: float | None = None
    lateral_offset: float | None = None
    distance_from_lha: float | None = None
    height_above_lha: float | None = None
    camera_gimbal_angle: float | None = None
    selected_lha_id: UUID | None = None
    lha_setting_angle_override_id: UUID | None = None
    hover_bearing: float | None = None
    hover_bearing_reference: HoverBearingRefStr | None = None
    white_balance: WhiteBalanceStr | None = None
    iso: int | None = None
    shutter_speed: str | None = None
    focus_mode: FocusModeStr | None = None
    optical_zoom: float | None = None
    camera_preset_id: UUID | None = None

    model_config = {"from_attributes": True}


class InspectionTemplateCreate(BaseModel):
    """inspection template create schema"""

    name: str
    description: str | None = None
    angular_tolerances: dict | None = None
    created_by: str | None = None
    default_config: InspectionConfigCreate | None = None
    target_agl_ids: list[UUID] = []
    methods: list[InspectionMethodStr] = []


class InspectionTemplateUpdate(BaseModel):
    """inspection template update schema"""

    name: str | None = None
    description: str | None = None
    angular_tolerances: dict | None = None
    target_agl_ids: list[UUID] | None = None
    methods: list[InspectionMethodStr] | None = None
    default_config: InspectionConfigCreate | None = None


class InspectionTemplateResponse(BaseModel):
    """inspection template response schema"""

    id: UUID
    name: str
    description: str | None = None
    angular_tolerances: dict | None = None
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    default_config: InspectionConfigResponse | None = None
    target_agl_ids: list[UUID] = []
    methods: list[InspectionMethodStr] = []
    mission_count: int = 0

    model_config = {"from_attributes": True}


class InspectionTemplateListResponse(BaseModel):
    """inspection template list response schema"""

    data: list[InspectionTemplateResponse]
    meta: ListMeta


class BulkCreateTemplatesRequest(BaseModel):
    """bulk create inspection templates request schema"""

    airport_id: UUID


class BulkCreateTemplatesResponse(BaseModel):
    """bulk create inspection templates response schema"""

    created: list[InspectionTemplateResponse]
    skipped: int
