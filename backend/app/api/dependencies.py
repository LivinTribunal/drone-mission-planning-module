"""rbac dependency functions for fastapi route injection."""

from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.services import auth_service

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# pre-built role sets to avoid per-request allocation
_OPERATOR_ROLES = frozenset(
    {UserRole.OPERATOR.value, UserRole.COORDINATOR.value, UserRole.SUPER_ADMIN.value}
)
_COORDINATOR_ROLES = frozenset({UserRole.COORDINATOR.value, UserRole.SUPER_ADMIN.value})
_SUPER_ADMIN_ROLES = frozenset({UserRole.SUPER_ADMIN.value})


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """extract and validate jwt, return the authenticated user."""
    payload = auth_service.verify_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user = auth_service.get_user_by_id(db, UUID(user_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="user not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_operator(current_user: User = Depends(get_current_user)) -> User:
    """allow operator, coordinator, and super_admin."""
    if current_user.role not in _OPERATOR_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient role")
    return current_user


def require_coordinator(current_user: User = Depends(get_current_user)) -> User:
    """allow coordinator and super_admin only."""
    if current_user.role not in _COORDINATOR_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient role")
    return current_user


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    """allow super_admin only."""
    if current_user.role not in _SUPER_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient role")
    return current_user


def get_airport_ids_for_user(user: User) -> list[UUID] | None:
    """return user's assigned airport ids, or none for super_admin (meaning all)."""
    if user.role == UserRole.SUPER_ADMIN.value:
        return None
    return auth_service.get_user_airport_ids(user)


__all__ = [
    "get_db",
    "get_current_user",
    "require_operator",
    "require_coordinator",
    "require_super_admin",
    "get_airport_ids_for_user",
]
