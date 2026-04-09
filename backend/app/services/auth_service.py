from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
from jose import jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User
from app.schemas.auth import UserResponse, UserUpdate

ALGORITHM = "HS256"

# pre-computed bcrypt hash for timing-safe auth - prevents user enumeration
_DUMMY_HASH = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW"


def hash_password(password: str) -> str:
    """hash a plain-text password with bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """verify a plain-text password against its bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: UUID, role: str) -> str:
    """create a short-lived jwt access token."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expiration_minutes)
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def create_refresh_token(user_id: UUID) -> str:
    """create a long-lived jwt refresh token.

    note: tokens are stateless - no server-side revocation. deactivation is
    mitigated by checking is_active on refresh.
    """
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expiration_days)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def verify_token(token: str) -> dict | None:
    """decode and validate a jwt token, return payload or none."""
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.JWTError:
        return None


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    """verify credentials and return user or none."""
    user = db.query(User).filter(User.email == email).first()
    if not user:
        verify_password(password, _DUMMY_HASH)  # equalise timing
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user


def get_user_by_id(db: Session, user_id: UUID) -> User | None:
    """load user by id."""
    return db.query(User).filter(User.id == user_id).first()


def build_user_response(user: User) -> UserResponse:
    """build user response dto from orm model."""
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        assigned_airport_ids=[a.id for a in user.assigned_airports],
        is_active=user.is_active,
        created_at=user.created_at,
    )


def update_user(db: Session, user: User, body: UserUpdate) -> User:
    """apply profile updates and persist."""
    if body.name is not None:
        user.name = body.name
    if body.password is not None:
        user.hashed_password = hash_password(body.password)

    db.commit()
    db.refresh(user)
    return user


def get_user_airport_ids(user: User) -> list[UUID]:
    """return list of assigned airport uuids."""
    return [a.id for a in user.assigned_airports]


def seed_users(db: Session) -> None:
    """create default users if seed passwords are configured via env."""
    from app.models.enums import UserRole

    seeds = [
        {
            "email": "admin@tarmacview.com",
            "password": settings.seed_admin_password,
            "name": "Admin",
            "role": UserRole.SUPER_ADMIN,
        },
        {
            "email": "coordinator@tarmacview.com",
            "password": settings.seed_coordinator_password,
            "name": "Coordinator",
            "role": UserRole.COORDINATOR,
        },
        {
            "email": "operator@tarmacview.com",
            "password": settings.seed_operator_password,
            "name": "Operator",
            "role": UserRole.OPERATOR,
        },
    ]

    # skip entries with no password configured
    seeds = [s for s in seeds if s["password"]]

    for seed in seeds:
        existing = db.query(User).filter(User.email == seed["email"]).first()
        if existing:
            continue

        user = User(
            email=seed["email"],
            hashed_password=hash_password(seed["password"]),
            name=seed["name"],
            role=seed["role"].value,
        )
        db.add(user)

    # assign all airports to admin on first seed only
    from app.models.airport import Airport

    admin = db.query(User).filter(User.email == "admin@tarmacview.com").first()
    if admin and not admin.assigned_airports:
        all_airports = db.query(Airport).all()
        admin.assigned_airports = list(all_airports)

    db.commit()
