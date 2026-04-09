import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.enums import UserRole

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class LoginRequest(BaseModel):
    """login credentials."""

    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        """basic rfc-style email format check."""
        if not _EMAIL_RE.match(v):
            raise ValueError("invalid email format")
        return v.lower().strip()


class LoginResponse(BaseModel):
    """login result with tokens and user info."""

    access_token: str
    refresh_token: str
    user: "UserResponse"


class RefreshRequest(BaseModel):
    """refresh token payload."""

    refresh_token: str


class RefreshResponse(BaseModel):
    """new access and refresh tokens."""

    access_token: str
    refresh_token: str


class UserResponse(BaseModel):
    """user info returned by api."""

    id: UUID
    email: str
    name: str
    role: UserRole
    assigned_airport_ids: list[UUID]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """update own profile - name and/or password."""

    name: str | None = Field(None, min_length=1)
    password: str | None = Field(None, min_length=8)
