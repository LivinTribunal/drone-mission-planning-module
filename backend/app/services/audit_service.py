"""audit log query service."""

import csv
import io
from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.models.audit_log import AuditLog

EXPORT_LIMIT = 100_000

SORTABLE_COLUMNS = {
    "timestamp": AuditLog.timestamp,
    "user_email": AuditLog.user_email,
    "action": AuditLog.action,
    "entity_type": AuditLog.entity_type,
    "entity_name": AuditLog.entity_name,
}


def list_audit_logs(
    db: Session,
    search: str | None = None,
    action: str | None = None,
    user_id: UUID | None = None,
    entity_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort_by: str = "timestamp",
    sort_dir: str = "desc",
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AuditLog], int]:
    """list audit log entries with optional filters and server-side sort."""
    query = db.query(AuditLog)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            (AuditLog.user_email.ilike(pattern))
            | (AuditLog.action.ilike(pattern))
            | (AuditLog.entity_name.ilike(pattern))
        )
    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if date_from:
        query = query.filter(AuditLog.timestamp >= date_from)
    if date_to:
        query = query.filter(AuditLog.timestamp <= date_to)

    total = query.count()

    col = SORTABLE_COLUMNS.get(sort_by, AuditLog.timestamp)
    order = col.asc() if sort_dir == "asc" else col.desc()
    entries = query.order_by(order).offset(offset).limit(limit).all()
    return entries, total


def export_audit_csv(
    db: Session,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> str:
    """export audit log as csv string."""
    query = db.query(AuditLog)
    if date_from:
        query = query.filter(AuditLog.timestamp >= date_from)
    if date_to:
        query = query.filter(AuditLog.timestamp <= date_to)

    row_count = query.count()
    if row_count > EXPORT_LIMIT:
        raise DomainError(
            f"export limited to {EXPORT_LIMIT} rows, got {row_count} - narrow the date range"
        )

    entries = query.order_by(AuditLog.timestamp.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "timestamp",
            "user_email",
            "action",
            "entity_type",
            "entity_name",
            "details",
            "ip_address",
        ]
    )

    for entry in entries:
        writer.writerow(
            [
                entry.timestamp.isoformat() if entry.timestamp else "",
                entry.user_email or "",
                entry.action,
                entry.entity_type or "",
                entry.entity_name or "",
                str(entry.details) if entry.details else "",
                entry.ip_address or "",
            ]
        )

    return output.getvalue()
