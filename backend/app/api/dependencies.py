from __future__ import annotations

from typing import TYPE_CHECKING, Annotated
from uuid import UUID

if TYPE_CHECKING:
    from app.models.mission import Mission

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import DomainError, NotFoundError
from app.models.enums import UserRole
from app.models.user import User
from app.services import auth_service, mission_service

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """extract and validate jwt, return user."""
    if not token:
        raise HTTPException(status_code=401, detail="not authenticated")
    try:
        payload = auth_service.decode_token(token)
    except DomainError:
        raise HTTPException(status_code=401, detail="invalid or expired token")
    user_id = payload.get("sub")
    if not user_id or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="invalid token")
    try:
        user = auth_service.get_user_by_id(db, UUID(user_id))
    except (NotFoundError, ValueError):
        raise HTTPException(status_code=401, detail="invalid token")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="user deactivated")
    return user


class RoleChecker:
    """callable dependency that enforces minimum role."""

    def __init__(self, allowed_roles: list[UserRole]):
        """create role checker for given roles."""
        self.allowed_roles = [r.value for r in allowed_roles]

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        """check user role against allowed list."""
        if current_user.role not in self.allowed_roles:
            raise HTTPException(status_code=403, detail="insufficient permissions")
        return current_user


require_operator = RoleChecker([UserRole.OPERATOR, UserRole.COORDINATOR, UserRole.SUPER_ADMIN])
require_coordinator = RoleChecker([UserRole.COORDINATOR, UserRole.SUPER_ADMIN])
require_super_admin = RoleChecker([UserRole.SUPER_ADMIN])


def check_airport_access(current_user: User, airport_id: UUID) -> None:
    """raise 403 if user lacks access to the given airport."""
    if not current_user.has_airport_access(airport_id):
        raise HTTPException(status_code=403, detail="no access to this airport")


def check_mission_access(db: Session, current_user: User, mission_id: UUID) -> Mission:
    """fetch mission and verify user has airport access, return mission."""
    mission = mission_service.get_mission(db, mission_id)
    check_airport_access(current_user, mission.airport_id)
    return mission


def get_user_airport_ids(user: User) -> list[UUID] | None:
    """return airport ids the user can access, or none for super admins."""
    if user.role == UserRole.SUPER_ADMIN.value:
        return None
    return [a.id for a in user.airports]


# annotated dependency types for route signatures
CurrentUser = Annotated[User, Depends(get_current_user)]
OperatorUser = Annotated[User, Depends(require_operator)]
CoordinatorUser = Annotated[User, Depends(require_coordinator)]
SuperAdminUser = Annotated[User, Depends(require_super_admin)]
