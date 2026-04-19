"""audit logging utility."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.user import User

from app.core.enums import AuditAction
from app.models.audit_log import AuditLog


def log_audit(
    db: Session,
    user: User | None,
    action: AuditAction,
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    entity_name: str | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """insert an audit log record. flushes but does not commit."""
    entry = AuditLog(
        user_id=user.id if user else None,
        user_email=user.email if user else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        details=details,
        ip_address=ip_address,
    )
    db.add(entry)
    db.flush()
