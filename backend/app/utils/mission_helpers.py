"""shared mission state helpers used by multiple services."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.mission import Mission


def delete_flight_plan_if_exists(db: Session, mission: Mission) -> None:
    """delete a mission's flight plan before trajectory invalidation."""
    if mission.flight_plan:
        db.delete(mission.flight_plan)
        db.flush()
