from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser
from app.core.dependencies import get_db
from app.core.exceptions import DomainError, NotFoundError
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    MessageResponse,
    RefreshRequest,
    RefreshResponse,
    ResetPasswordRequest,
    SetupPasswordRequest,
    UserResponse,
    UserUpdate,
)
from app.services import auth_service

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """authenticate with email and password."""
    user = auth_service.authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="invalid email or password")

    auth_service.update_last_login(db, user)

    return LoginResponse(
        access_token=auth_service.create_access_token(user.id, user.role),
        refresh_token=auth_service.create_refresh_token(user.id),
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh", response_model=RefreshResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    """exchange refresh token for new access token."""
    try:
        payload = auth_service.decode_token(body.refresh_token)
    except DomainError:
        raise HTTPException(status_code=401, detail="invalid or expired refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="invalid token type")

    try:
        user = auth_service.get_user_by_id(db, UUID(payload["sub"]))
    except NotFoundError:
        raise HTTPException(status_code=401, detail="invalid or expired refresh token")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="user deactivated")

    return RefreshResponse(
        access_token=auth_service.create_access_token(user.id, user.role),
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: CurrentUser):
    """get current authenticated user profile."""
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse)
def update_me(
    body: UserUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """update own profile (name, password)."""
    user = auth_service.update_user_profile(db, current_user, body)
    return UserResponse.model_validate(user)


@router.post("/setup-password", status_code=200, response_model=MessageResponse)
def setup_password(body: SetupPasswordRequest, db: Session = Depends(get_db)):
    """complete invitation - set password and activate account."""
    try:
        auth_service.setup_password(db, body)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

    return MessageResponse(message="password set successfully")


@router.post("/reset-password", status_code=200, response_model=MessageResponse)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """reset password using token."""
    try:
        auth_service.reset_password(db, body)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

    return MessageResponse(message="password reset successfully")
