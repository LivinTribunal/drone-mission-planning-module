from uuid import UUID

from pydantic import BaseModel


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
    assigned_airports: list[AirportSummary] = []

    model_config = {"from_attributes": True}


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
    password: str | None = None
    current_password: str | None = None


class SetupPasswordRequest(BaseModel):
    """set password from invitation link."""

    token: str
    password: str


class ResetPasswordRequest(BaseModel):
    """reset password via token."""

    token: str
    new_password: str
