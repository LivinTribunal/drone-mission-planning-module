from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class AirportSummary(BaseModel):
    """minimal airport info for user response."""

    id: UUID
    icao_code: str
    name: str

    model_config = {"from_attributes": True}


class UserResponse(BaseModel):
    """authenticated user profile."""

    id: UUID
    email: str
    name: str
    role: str
    airports: list[AirportSummary] = []

    model_config = {"from_attributes": True, "populate_by_name": True}


class LoginRequest(BaseModel):
    """login credentials."""

    email: str
    password: str


class LoginResponse(BaseModel):
    """tokens + user returned after login."""

    access_token: str
    refresh_token: str
    user: UserResponse


class RefreshRequest(BaseModel):
    """refresh token payload."""

    refresh_token: str


class RefreshResponse(BaseModel):
    """new access token."""

    access_token: str


class UserUpdate(BaseModel):
    """update own profile - name and/or password."""

    name: str | None = None
    password: str | None = Field(default=None, min_length=8)
    current_password: str | None = None

    @model_validator(mode="after")
    def require_current_password_for_change(self):
        """enforce current_password when setting a new password."""
        if self.password is not None and not self.current_password:
            raise ValueError("current password is required to set a new password")
        return self


class SetupPasswordRequest(BaseModel):
    """set password from invitation link."""

    token: str
    password: str = Field(min_length=8)


class ResetPasswordRequest(BaseModel):
    """reset password via token."""

    token: str
    new_password: str = Field(min_length=8)


class MessageResponse(BaseModel):
    """simple message response."""

    message: str
