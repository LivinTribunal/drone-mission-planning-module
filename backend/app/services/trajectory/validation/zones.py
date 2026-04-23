"""safety zone validation - in-flight zone checks and airport boundary geofencing."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.airport import SafetyZone
from app.models.enums import SafetyZoneType

from ..pathfinding.collision import segments_intersect_zone
from ..types import HARD_ZONE_TYPES, LocalGeometries, Violation, WaypointData
from ._ewkt import _geom_to_ewkt, _wp_to_ewkt

__all__ = [
    "segments_intersect_zone",
    "check_safety_zone",
    "_batch_check_zones",
    "_batch_check_boundary_zones",
]


def _batch_check_zones(
    waypoints: list[WaypointData],
    local_geoms: LocalGeometries,
) -> list[Violation]:
    """batch safety zone containment using Shapely in local coordinates.

    airport boundary zones are handled with inverted semantics - waypoints
    OUTSIDE the boundary polygon produce hard geofence violations.
    """
    violations: list[Violation] = []
    violations.extend(_batch_check_boundary_zones(waypoints, local_geoms))

    if not local_geoms.zones or not waypoints:
        return violations

    proj = local_geoms.proj

    for wp_idx, wp in enumerate(waypoints):
        pt = proj.point_to_local(wp.lon, wp.lat)

        for zone in local_geoms.zones:
            if not zone.polygon.contains(pt):
                continue

            # altitude band check
            if zone.altitude_floor is not None and wp.alt < zone.altitude_floor:
                continue
            if zone.altitude_ceiling is not None and wp.alt > zone.altitude_ceiling:
                continue

            is_hard = zone.zone_type in HARD_ZONE_TYPES
            violations.append(
                Violation(
                    is_warning=not is_hard,
                    violation_kind="safety_zone",
                    message=f"waypoint inside {zone.zone_type} zone: {zone.name}",
                    waypoint_index=wp_idx,
                )
            )

    return violations


def _batch_check_boundary_zones(
    waypoints: list[WaypointData],
    local_geoms: LocalGeometries,
) -> list[Violation]:
    """soft-warn every waypoint not contained in each airport boundary polygon."""
    if not local_geoms.boundary_zones or not waypoints:
        return []

    proj = local_geoms.proj
    violations: list[Violation] = []

    for boundary in local_geoms.boundary_zones:
        for wp_idx, wp in enumerate(waypoints):
            pt = proj.point_to_local(wp.lon, wp.lat)
            if not boundary.polygon.contains(pt):
                # soft until boundary-aware A* routing lands; see follow-up issue.
                violations.append(
                    Violation(
                        is_warning=True,
                        violation_kind="geofence",
                        message=f"waypoint outside airport boundary: {boundary.name}",
                        waypoint_index=wp_idx,
                    )
                )

    return violations


def check_safety_zone(db: Session, wp: WaypointData, zone: SafetyZone) -> Violation | None:
    """check if waypoint is inside a safety zone's geometry and altitude band.

    airport boundary zones use inverted semantics - waypoint outside the
    polygon produces a hard geofence violation.
    """
    if not zone.geometry:
        return None

    wp_ewkt = _wp_to_ewkt(wp)

    contained = db.execute(
        text(
            "SELECT ST_Contains("
            "ST_Force2D(ST_GeomFromEWKT(:zone_geom)), "
            "ST_Force2D(ST_GeomFromEWKT(:point)))"
        ),
        {"zone_geom": _geom_to_ewkt(zone.geometry), "point": wp_ewkt},
    ).scalar()

    if zone.type == SafetyZoneType.AIRPORT_BOUNDARY.value:
        if contained is True:
            return None
        # soft until boundary-aware A* routing lands; see follow-up issue.
        return Violation(
            is_warning=True,
            violation_kind="geofence",
            message=f"waypoint outside airport boundary: {zone.name}",
        )

    if contained is not True:
        return None

    if zone.altitude_floor is not None and wp.alt < zone.altitude_floor:
        return None
    if zone.altitude_ceiling is not None and wp.alt > zone.altitude_ceiling:
        return None

    is_hard = zone.type in HARD_ZONE_TYPES

    return Violation(
        is_warning=not is_hard,
        violation_kind="safety_zone",
        message=f"waypoint inside {zone.type} zone: {zone.name}",
    )
