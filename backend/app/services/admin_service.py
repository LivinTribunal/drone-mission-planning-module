"""admin user management and system settings service."""

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import ConflictError, DomainError, NotFoundError
from app.models.airport import Airport
from app.models.enums import UserRole
from app.models.system_settings import SystemSettings
from app.models.user import User, user_airports

SETTINGS_DEFAULTS = {
    "maintenance_mode": "false",
    "cesium_ion_token": "",
    "elevation_api_url": "https://api.open-elevation.com",
}


def list_users(
    db: Session,
    role: str | None = None,
    is_active: bool | None = None,
    airport_id: UUID | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[User], int]:
    """list users with optional filters."""
    base = db.query(User)

    if role:
        base = base.filter(User.role == role)
    if is_active is not None:
        base = base.filter(User.is_active == is_active)
    if airport_id:
        base = base.filter(User.airports.any(Airport.id == airport_id))
    if search:
        pattern = f"%{search}%"
        base = base.filter((User.name.ilike(pattern)) | (User.email.ilike(pattern)))

    # count on base query without joinedload to avoid row inflation
    total = base.count()
    users = (
        base.options(joinedload(User.airports))
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return users, total


def get_user(db: Session, user_id: UUID) -> User:
    """get user by id with airports loaded."""
    user = db.query(User).options(joinedload(User.airports)).filter(User.id == user_id).first()
    if not user:
        raise NotFoundError("user not found")
    return user


def invite_user(
    db: Session,
    email: str,
    name: str,
    role: str,
    airport_ids: list[UUID],
) -> tuple[User, str]:
    """create inactive user with invitation token, return user and token."""
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise ConflictError("user with this email already exists")

    valid_roles = [r.value for r in UserRole]
    if role not in valid_roles:
        raise DomainError(f"invalid role: {role}")

    token = str(uuid4())
    user = User(
        email=email,
        name=name,
        role=role,
        is_active=False,
        invitation_token=token,
        invitation_expires_at=datetime.now(timezone.utc) + timedelta(hours=72),
    )

    if airport_ids:
        airports = db.query(Airport).filter(Airport.id.in_(airport_ids)).all()
        user.airports = airports

    db.add(user)
    db.commit()
    db.refresh(user)
    return user, token


def update_user(
    db: Session, user_id: UUID, name: str | None, email: str | None, role: str | None
) -> User:
    """update user fields."""
    user = get_user(db, user_id)

    if email and email != user.email:
        existing = db.query(User).filter(User.email == email, User.id != user_id).first()
        if existing:
            raise ConflictError("email already in use")
        user.email = email

    if name is not None:
        user.name = name

    if role is not None:
        valid_roles = [r.value for r in UserRole]
        if role not in valid_roles:
            raise DomainError(f"invalid role: {role}")
        user.role = role

    db.commit()
    db.refresh(user)
    return user


def deactivate_user(db: Session, user_id: UUID) -> User:
    """soft deactivate user."""
    user = get_user(db, user_id)
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user


def activate_user(db: Session, user_id: UUID) -> User:
    """reactivate user."""
    user = get_user(db, user_id)
    user.is_active = True
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: UUID) -> None:
    """hard delete - only allowed for inactive users."""
    user = get_user(db, user_id)
    if user.is_active:
        raise DomainError("can only delete inactive users")
    db.delete(user)
    db.commit()


def reset_password(db: Session, user_id: UUID) -> str:
    """generate new invitation token for password reset."""
    user = get_user(db, user_id)
    token = str(uuid4())
    user.invitation_token = token
    user.invitation_expires_at = datetime.now(timezone.utc) + timedelta(hours=72)
    db.commit()
    return token


def update_airport_assignments(db: Session, user_id: UUID, airport_ids: list[UUID]) -> User:
    """replace user airport assignments."""
    user = get_user(db, user_id)
    airports = db.query(Airport).filter(Airport.id.in_(airport_ids)).all() if airport_ids else []
    user.airports = airports
    db.commit()
    db.refresh(user)
    return user


def list_airports_admin(
    db: Session,
    search: str | None = None,
    country: str | None = None,
) -> list[dict]:
    """list airports with user/mission/drone counts for admin overview."""
    from app.models.mission import Mission

    # subquery aggregates - single round-trip instead of 4N+1
    user_counts = (
        db.query(
            user_airports.c.airport_id,
            func.count().label("user_count"),
        )
        .group_by(user_airports.c.airport_id)
        .subquery()
    )

    coordinator_counts = (
        db.query(
            user_airports.c.airport_id,
            func.count().label("coordinator_count"),
        )
        .join(User, User.id == user_airports.c.user_id)
        .filter(User.role == UserRole.COORDINATOR.value)
        .group_by(user_airports.c.airport_id)
        .subquery()
    )

    mission_counts = (
        db.query(
            Mission.airport_id,
            func.count().label("mission_count"),
        )
        .group_by(Mission.airport_id)
        .subquery()
    )

    drone_counts = (
        db.query(
            Mission.airport_id,
            func.count(func.distinct(Mission.drone_profile_id)).label("drone_count"),
        )
        .filter(Mission.drone_profile_id.isnot(None))
        .group_by(Mission.airport_id)
        .subquery()
    )

    query = (
        db.query(
            Airport,
            func.coalesce(user_counts.c.user_count, 0).label("user_count"),
            func.coalesce(coordinator_counts.c.coordinator_count, 0).label("coordinator_count"),
            func.coalesce(mission_counts.c.mission_count, 0).label("mission_count"),
            func.coalesce(drone_counts.c.drone_count, 0).label("drone_count"),
        )
        .outerjoin(user_counts, Airport.id == user_counts.c.airport_id)
        .outerjoin(coordinator_counts, Airport.id == coordinator_counts.c.airport_id)
        .outerjoin(mission_counts, Airport.id == mission_counts.c.airport_id)
        .outerjoin(drone_counts, Airport.id == drone_counts.c.airport_id)
    )

    if search:
        pattern = f"%{search.lower()}%"
        query = query.filter(
            func.lower(Airport.name).like(pattern)
            | func.lower(Airport.icao_code).like(pattern)
            | func.lower(Airport.city).like(pattern)
        )

    if country:
        query = query.filter(func.lower(Airport.country) == country.lower())

    rows = query.all()

    return [
        {
            "id": airport.id,
            "icao_code": airport.icao_code,
            "name": airport.name,
            "city": airport.city,
            "country": airport.country,
            "user_count": uc,
            "coordinator_count": cc,
            "mission_count": mc,
            "drone_count": dc,
            "terrain_source": airport.terrain_source,
            "created_at": None,
        }
        for airport, uc, cc, mc, dc in rows
    ]


# system settings


def _get_setting(db: Session, key: str) -> str:
    """get a single setting value, falling back to default."""
    row = db.query(SystemSettings).filter(SystemSettings.key == key).first()
    if row:
        return row.value or SETTINGS_DEFAULTS.get(key, "")
    return SETTINGS_DEFAULTS.get(key, "")


def get_system_settings(db: Session) -> dict:
    """get all system settings as a dict."""
    return {
        "maintenance_mode": _get_setting(db, "maintenance_mode") == "true",
        "cesium_ion_token": _get_setting(db, "cesium_ion_token"),
        "elevation_api_url": _get_setting(db, "elevation_api_url"),
    }


def update_system_settings(
    db: Session,
    user_id: UUID,
    maintenance_mode: bool | None = None,
    cesium_ion_token: str | None = None,
    elevation_api_url: str | None = None,
) -> dict:
    """upsert system settings."""
    updates = {}
    if maintenance_mode is not None:
        updates["maintenance_mode"] = str(maintenance_mode).lower()
    if cesium_ion_token is not None:
        updates["cesium_ion_token"] = cesium_ion_token
    if elevation_api_url is not None:
        updates["elevation_api_url"] = elevation_api_url

    for key, value in updates.items():
        row = db.query(SystemSettings).filter(SystemSettings.key == key).first()
        if row:
            row.value = value
            row.updated_by = user_id
        else:
            row = SystemSettings(key=key, value=value, updated_by=user_id)
            db.add(row)

    db.commit()
    return get_system_settings(db)


def is_maintenance_mode(db: Session) -> bool:
    """check if maintenance mode is enabled via system_settings table."""
    return _get_setting(db, "maintenance_mode") == "true"
