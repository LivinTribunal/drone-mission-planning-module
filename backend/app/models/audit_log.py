"""audit log model for tracking system activity."""

from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class AuditLog(Base):
    """immutable record of a user action in the system."""

    __tablename__ = "audit_log"

    id = Column(UUID, primary_key=True, default=uuid4)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    user_id = Column(UUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    user_email = Column(String, nullable=True)
    action = Column(String(30), nullable=False)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(UUID, nullable=True)
    entity_name = Column(String, nullable=True)
    details = Column(JSONB, nullable=True)
    ip_address = Column(String(45), nullable=True)

    user = relationship("User", foreign_keys=[user_id])
