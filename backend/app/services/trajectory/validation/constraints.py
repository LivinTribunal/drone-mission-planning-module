"""per-waypoint constraint dispatch and violation construction."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.airport import AirfieldSurface
from app.models.enums import ConstraintType
from app.models.flight_plan import ConstraintRule

from ..types import Violation, WaypointData
from ._ewkt import _geom_to_ewkt, _wp_to_ewkt
from .runway import _check_runway_buffer

__all__ = ["_check_constraint", "_violation"]

logger = logging.getLogger(__name__)


def _check_constraint(
    db: Session | None,
    wp: WaypointData,
    constraint: ConstraintRule,
    surfaces: list[AirfieldSurface],
) -> Violation | None:
    """dispatch waypoint check based on constraint type."""
    ctype = constraint.constraint_type

    if ctype == ConstraintType.ALTITUDE:
        if constraint.min_altitude is not None and wp.alt < constraint.min_altitude:
            return _violation(
                constraint,
                f"alt {wp.alt:.0f}m below min {constraint.min_altitude:.0f}m",
            )
        if constraint.max_altitude is not None and wp.alt > constraint.max_altitude:
            return _violation(
                constraint,
                f"alt {wp.alt:.0f}m above max {constraint.max_altitude:.0f}m",
            )

    elif ctype == ConstraintType.SPEED:
        max_speed = constraint.max_horizontal_speed
        if max_speed is not None and wp.speed > max_speed:
            return _violation(
                constraint,
                f"speed {wp.speed:.1f} exceeds max {constraint.max_horizontal_speed:.1f} m/s",
            )

    elif ctype == ConstraintType.GEOFENCE and constraint.boundary:
        if db is None:
            logger.warning("skipping GEOFENCE constraint check - no db session available")
            return Violation(
                is_warning=True,
                violation_kind="constraint",
                message="GEOFENCE constraint not checked - spatial query unavailable",
            )
        wp_ewkt = _wp_to_ewkt(wp)
        contained = db.execute(
            text(
                "SELECT ST_Contains("
                "ST_Force2D(ST_GeomFromEWKT(:boundary)), "
                "ST_Force2D(ST_GeomFromEWKT(:point)))"
            ),
            {"boundary": _geom_to_ewkt(constraint.boundary), "point": wp_ewkt},
        ).scalar()

        if contained is not True:
            return _violation(constraint, "waypoint outside geofence boundary")

    elif ctype == ConstraintType.RUNWAY_BUFFER:
        if db is None:
            logger.warning("skipping RUNWAY_BUFFER constraint check - no db session available")
            return Violation(
                is_warning=True,
                violation_kind="constraint",
                message="RUNWAY_BUFFER constraint not checked - spatial query unavailable",
            )
        v = _check_runway_buffer(db, wp, constraint, surfaces)
        if v:
            return v

    return None


def _violation(constraint: ConstraintRule, message: str) -> Violation:
    """create a violation from a constraint, inheriting its hard/soft flag."""
    return Violation(
        is_warning=not constraint.is_hard_constraint,
        violation_kind="constraint",
        message=message,
        constraint_id=str(constraint.id),
    )
