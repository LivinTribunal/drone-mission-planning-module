from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser
from app.core.config import settings
from app.core.dependencies import get_db
from app.core.exceptions import DomainError, NotFoundError
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    MessageResponse,
    RefreshResponse,
    ResetPasswordRequest,
    SetupPasswordRequest,
    UserResponse,
    UserUpdate,
)
from app.services import auth_service
from app.utils.audit import log_audit

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _set_refresh_cookie(response: Response, token: str) -> None:
    """set refresh token as httponly cookie."""
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite="strict",
        max_age=settings.jwt_refresh_expiration_days * 86400,
        path="/api/v1/auth",
        domain=settings.refresh_cookie_domain,
    )


def _clear_refresh_cookie(response: Response) -> None:
    """delete refresh token cookie."""
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite="strict",
        path="/api/v1/auth",
        domain=settings.refresh_cookie_domain,
    )


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """authenticate with email and password."""
    user = auth_service.authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="invalid email or password")

    auth_service.update_last_login(db, user)
    log_audit(
        db,
        user,
        "LOGIN",
        entity_type="User",
        entity_id=user.id,
        entity_name=user.email,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    refresh_token = auth_service.create_refresh_token(user.id)
    _set_refresh_cookie(response, refresh_token)

    return LoginResponse(
        access_token=auth_service.create_access_token(user.id, user.role),
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh", response_model=RefreshResponse)
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """exchange refresh token cookie for new access token."""
    tarmacview_refresh = request.cookies.get(settings.refresh_cookie_name)
    if not tarmacview_refresh:
        raise HTTPException(status_code=401, detail="missing refresh token")

    try:
        payload = auth_service.decode_token(tarmacview_refresh)
    except DomainError:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="invalid or expired refresh token")

    if payload.get("type") != "refresh":
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="invalid token type")

    try:
        user = auth_service.get_user_by_id(db, UUID(payload["sub"]))
    except NotFoundError:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="invalid or expired refresh token")
    if not user.is_active:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="user deactivated")

    # rotate refresh token
    new_refresh = auth_service.create_refresh_token(user.id)
    _set_refresh_cookie(response, new_refresh)

    return RefreshResponse(
        access_token=auth_service.create_access_token(user.id, user.role),
    )


@router.post("/logout")
def logout(response: Response):
    """clear refresh token cookie."""
    _clear_refresh_cookie(response)
    return {"message": "logged out"}


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
