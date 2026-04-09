from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base

# junction table
user_airports = Table(
    "user_airports",
    Base.metadata,
    Column("user_id", UUID, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("airport_id", UUID, ForeignKey("airport.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    """user account with role-based access."""

    __tablename__ = "users"

    id = Column(UUID, primary_key=True, default=uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="OPERATOR")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # relationships
    assigned_airports = relationship("Airport", secondary=user_airports, lazy="selectin")
