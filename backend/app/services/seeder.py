import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.airport import Airport
from app.models.enums import UserRole
from app.models.user import User

logger = logging.getLogger(__name__)


def seed_users(db: Session) -> None:
    """create default users if none exist. requires SEED_USERS=true."""
    if settings.environment == "production":
        logger.info("skipping user seeding in production environment")
        return

    if not settings.seed_users:
        logger.info("user seeding disabled (set SEED_USERS=true to enable)")
        return

    count = db.query(User).count()
    if count > 0:
        return

    airports = db.query(Airport).all()
    logger.info("seeding %d default users with %d airports", 3, len(airports))

    seed_data = [
        (settings.seed_admin_email, settings.seed_admin_password,
         "Admin", UserRole.SUPER_ADMIN.value),
        (settings.seed_coordinator_email, settings.seed_coordinator_password,
         "Coordinator", UserRole.COORDINATOR.value),
        (settings.seed_operator_email, settings.seed_operator_password,
         "Operator", UserRole.OPERATOR.value),
    ]

    for email, password, name, role in seed_data:
        user = User(email=email, name=name, role=role, is_active=True)
        user.set_password(password)
        user.airports = list(airports)
        db.add(user)

    db.commit()
    logger.info("seeded default users")
