import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
from jose import JWTError, jwt
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.exceptions import DomainError, NotFoundError
from app.models.airport import Airport
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.auth import ResetPasswordRequest, SetupPasswordRequest, UserUpdate

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"

# precomputed hash for timing-safe rejection of unknown emails
_DUMMY_HASH = bcrypt.hashpw(b"timing-safe-dummy", bcrypt.gensalt()).decode("utf-8")


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    """verify email + password, return user or none."""
    user = db.query(User).options(joinedload(User.airports)).filter(User.email == email).first()
    if not user:
        bcrypt.checkpw(password.encode("utf-8"), _DUMMY_HASH.encode("utf-8"))
        return None
    if not user.is_active or not user.verify_password(password):
        return None
    return user


def create_access_token(user_id: UUID, role: str) -> str:
    """create jwt access token."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expiration_minutes)
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def create_refresh_token(user_id: UUID) -> str:
    """create jwt refresh token with longer expiry."""
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expiration_days)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """decode and validate a jwt token."""
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except JWTError as e:
        raise DomainError("invalid or expired token", status_code=401) from e


def update_last_login(db: Session, user: User) -> None:
    """set last_login timestamp."""
    user.last_login = datetime.now(timezone.utc)
    db.commit()


def get_user_by_id(db: Session, user_id: UUID) -> User:
    """fetch user by id with airports loaded."""
    user = db.query(User).options(joinedload(User.airports)).filter(User.id == user_id).first()
    if not user:
        raise NotFoundError("user not found")
    return user


def update_user_profile(db: Session, user: User, data: UserUpdate) -> User:
    """update own name and/or password."""
    if data.current_password and not user.verify_password(data.current_password):
        raise DomainError("current password is incorrect", status_code=400)
    if data.name is not None:
        user.name = data.name
    if data.password is not None:
        user.set_password(data.password)
    db.commit()
    db.refresh(user)
    return user


def setup_password(db: Session, data: SetupPasswordRequest) -> None:
    """complete invitation flow - set password and activate user."""
    user = db.query(User).filter(User.invitation_token == data.token).first()
    if not user:
        raise DomainError("invalid invitation token", status_code=400)
    if not user.is_invitation_valid():
        raise DomainError("invitation has expired", status_code=400)
    user.set_password(data.password)
    user.is_active = True
    user.invitation_token = None
    user.invitation_expires_at = None
    db.commit()


def reset_password(db: Session, data: ResetPasswordRequest) -> None:
    """reset password via invitation token mechanism."""
    user = db.query(User).filter(User.invitation_token == data.token).first()
    if not user:
        raise DomainError("invalid reset token", status_code=400)
    if not user.is_invitation_valid():
        raise DomainError("reset token has expired", status_code=400)
    user.set_password(data.new_password)
    user.invitation_token = None
    user.invitation_expires_at = None
    db.commit()


def seed_users(db: Session) -> None:
    """create default users if none exist. skipped in production."""
    if settings.environment == "production":
        logger.info("skipping user seeding in production environment")
        return

    count = db.query(User).count()
    if count > 0:
        return

    airports = db.query(Airport).all()
    logger.info("seeding %d default users with %d airports", 3, len(airports))

    seed_data = [
        ("admin@tmv.com", "adminadmin", "Admin", UserRole.SUPER_ADMIN.value),
        ("coord@tmv.com", "coordinator", "Coordinator", UserRole.COORDINATOR.value),
        ("operator@tmv.com", "operator", "Operator", UserRole.OPERATOR.value),
    ]

    for email, password, name, role in seed_data:
        user = User(email=email, name=name, role=role, is_active=True)
        user.set_password(password)
        user.airports = list(airports)
        db.add(user)

    db.commit()
    logger.info("seeded default users")
