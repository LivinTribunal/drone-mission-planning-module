"""pydantic schemas for admin endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.auth import AirportSummary


class UserInviteRequest(BaseModel):
    """invitation payload."""

    email: EmailStr
    name: str = Field(min_length=1)
    role: str = "OPERATOR"
    airport_ids: list[UUID] = []


class UserAdminUpdate(BaseModel):
    """admin-editable user fields."""

    name: str | None = None
    email: EmailStr | None = None
    role: str | None = None


class UserAdminResponse(BaseModel):
    """user detail for admin views."""

    id: UUID
    email: str
    name: str
    role: str
    is_active: bool
    airports: list[AirportSummary] = []
    last_login: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InvitationResponse(BaseModel):
    """result of user invitation."""

    user: UserAdminResponse
    invitation_link: str


class AirportAssignmentUpdate(BaseModel):
    """replace user airport assignments."""

    airport_ids: list[UUID]


class AirportAdminResponse(BaseModel):
    """airport overview for admin views."""

    id: UUID
    icao_code: str
    name: str
    city: str | None = None
    country: str | None = None
    user_count: int = 0
    coordinator_count: int = 0
    mission_count: int = 0
    drone_count: int = 0
    terrain_source: str = "FLAT"
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class SystemSettingsResponse(BaseModel):
    """all system settings."""

    maintenance_mode: bool = False
    cesium_ion_token: str = ""
    elevation_api_url: str = "https://api.open-elevation.com"


class SystemSettingsUpdate(BaseModel):
    """updatable system settings."""

    maintenance_mode: bool | None = None
    cesium_ion_token: str | None = None
    elevation_api_url: str | None = None


class AuditLogResponse(BaseModel):
    """single audit log entry."""

    id: UUID
    timestamp: datetime
    user_id: UUID | None = None
    user_email: str | None = None
    action: str
    entity_type: str | None = None
    entity_id: UUID | None = None
    entity_name: str | None = None
    details: dict | None = None
    ip_address: str | None = None

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    """paginated audit log."""

    data: list[AuditLogResponse]
    meta: dict


class UserListMeta(BaseModel):
    """list metadata."""

    total: int
    limit: int | None = None
    offset: int | None = None
