from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import DomainError, NotFoundError
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RefreshResponse,
    ResetPasswordRequest,
    SetupPasswordRequest,
    UserResponse,
    UserUpdate,
)
from app.services import auth_service

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _user_response(user: User) -> UserResponse:
    """build user response dto from orm model."""
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        assigned_airports=[
            {"id": a.id, "icao_code": a.icao_code, "name": a.name} for a in user.airports
        ],
    )


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
        user=_user_response(user),
    )


@router.post("/refresh", response_model=RefreshResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    """exchange refresh token for new access token."""
    try:
        payload = auth_service.decode_token(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="invalid or expired refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="invalid token type")

    try:
        user = auth_service.get_user_by_id(db, payload["sub"])
    except (NotFoundError, Exception):
        raise HTTPException(status_code=401, detail="invalid or expired refresh token")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="user deactivated")

    return RefreshResponse(
        access_token=auth_service.create_access_token(user.id, user.role),
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """get current authenticated user profile."""
    return _user_response(current_user)


@router.put("/me", response_model=UserResponse)
def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """update own profile (name, password)."""
    if body.password and not body.current_password:
        raise HTTPException(status_code=400, detail="current password required to set new password")
    if body.current_password and not current_user.verify_password(body.current_password):
        raise HTTPException(status_code=400, detail="current password is incorrect")

    user = auth_service.update_user_profile(db, current_user, body.name, body.password)
    return _user_response(user)


@router.post("/setup-password", status_code=200)
def setup_password(body: SetupPasswordRequest, db: Session = Depends(get_db)):
    """complete invitation - set password and activate account."""
    try:
        auth_service.setup_password(db, body.token, body.password)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception:
        raise HTTPException(status_code=400, detail="password setup failed")

    return {"message": "password set successfully"}


@router.post("/reset-password", status_code=200)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """reset password using token."""
    try:
        auth_service.reset_password(db, body.token, body.new_password)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception:
        raise HTTPException(status_code=400, detail="password reset failed")

    return {"message": "password reset successfully"}
