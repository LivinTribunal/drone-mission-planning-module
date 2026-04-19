"""system settings key-value store."""

from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class SystemSettings(Base):
    """key-value settings that override env defaults."""

    __tablename__ = "system_settings"

    id = Column(UUID, primary_key=True, default=uuid4)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(String, nullable=True)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by = Column(UUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
