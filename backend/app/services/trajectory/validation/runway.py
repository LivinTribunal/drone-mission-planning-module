"""runway buffer validation and segment-crossing length primitive re-export."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.airport import AirfieldSurface
from app.models.enums import SurfaceType
from app.models.flight_plan import ConstraintRule

from ..pathfinding.collision import segment_runway_crossing_length
from ..types import DEFAULT_RUNWAY_BUFFER, Violation, WaypointData
from ._ewkt import _geom_to_ewkt, _wp_to_ewkt

__all__ = [
    "segment_runway_crossing_length",
    "_check_runway_buffer",
]


def _check_runway_buffer(
    db: Session,
    wp: WaypointData,
    constraint: ConstraintRule,
    surfaces: list[AirfieldSurface],
) -> Violation | None:
    """check if waypoint is within lateral buffer of a runway centerline."""
    buffer_m = constraint.lateral_buffer or DEFAULT_RUNWAY_BUFFER
    wp_ewkt = _wp_to_ewkt(wp)

    for surface in surfaces:
        if surface.surface_type != SurfaceType.RUNWAY:
            continue
        if not surface.geometry:
            continue

        too_close = db.execute(
            text(
                "SELECT ST_DWithin("
                "ST_Force2D(ST_GeomFromEWKT(:rwy_geom))::geography, "
                "ST_Force2D(ST_GeomFromEWKT(:point))::geography, "
                ":buffer)"
            ),
            {
                "rwy_geom": _geom_to_ewkt(surface.geometry),
                "point": wp_ewkt,
                "buffer": buffer_m,
            },
        ).scalar()

        if too_close:
            return Violation(
                is_warning=not constraint.is_hard_constraint,
                violation_kind="constraint",
                message=f"waypoint within {buffer_m:.0f}m of runway {surface.identifier}",
                constraint_id=str(constraint.id),
            )

    return None
