"""re-exports for backwards compatibility - actual auth deps live in app.api.dependencies."""

from app.core.database import get_db

__all__ = [
    "get_db",
]
