from datetime import datetime
from uuid import uuid4

import bcrypt
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Table, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.enums import UserRole

# many-to-many junction
user_airports = Table(
    "user_airports",
    Base.metadata,
    Column("user_id", UUID, ForeignKey("user.id", ondelete="CASCADE"), primary_key=True),
    Column("airport_id", UUID, ForeignKey("airport.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    """application user with role-based access."""

    __tablename__ = "user"

    id = Column(UUID, primary_key=True, default=uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=True)
    name = Column(String, nullable=False)
    role = Column(String(20), nullable=False, default=UserRole.OPERATOR.value)
    is_active = Column(Boolean, default=True, nullable=False)
    invitation_token = Column(String, nullable=True)
    invitation_expires_at = Column(DateTime(timezone=True), nullable=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # relationships
    airports = relationship("Airport", secondary=user_airports)

    def verify_password(self, plain_password: str) -> bool:
        """check plain password against stored hash."""
        if not self.hashed_password:
            return False
        return bcrypt.checkpw(plain_password.encode("utf-8"), self.hashed_password.encode("utf-8"))

    def set_password(self, plain_password: str) -> None:
        """hash and store a new password."""
        salt = bcrypt.gensalt()
        self.hashed_password = bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")

    def has_airport_access(self, airport_id) -> bool:
        """check if user is assigned to a given airport."""
        if self.role == UserRole.SUPER_ADMIN.value:
            return True
        return any(str(a.id) == str(airport_id) for a in self.airports)

    def is_invitation_valid(self) -> bool:
        """check if invitation token is still valid."""
        if not self.invitation_token or not self.invitation_expires_at:
            return False
        return datetime.now(self.invitation_expires_at.tzinfo) < self.invitation_expires_at
