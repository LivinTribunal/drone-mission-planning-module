from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.airport import Airport, SafetyZone
from app.models.flight_plan import ConstraintRule
from app.services.geo import geojson_to_ewkt


def validate_waypoints(
    db: Session,
    waypoints: list,
    constraints: list[ConstraintRule],
    airport: Airport,
) -> list[dict]:
    """check waypoints against constraints - returns list of violation dicts"""
    violations = []

    for constraint in constraints:
        for wp in waypoints:
            v = _check_constraint(db, wp, constraint)
            if v:
                violations.append(v)

    # check safety zones
    safety_zones = (
        db.query(SafetyZone)
        .filter(
            SafetyZone.airport_id == airport.id,
            SafetyZone.is_active == True,  # noqa: E712
        )
        .all()
    )

    for zone in safety_zones:
        for wp in waypoints:
            v = _check_safety_zone(db, wp, zone)
            if v:
                violations.append(v)

    return violations


def _check_constraint(db: Session, wp, constraint: ConstraintRule) -> dict | None:
    """check single waypoint against single constraint"""
    ctype = constraint.constraint_type

    if ctype == "ALTITUDE":
        if constraint.min_altitude and wp.alt < constraint.min_altitude:
            return _violation(
                constraint,
                f"waypoint at alt {wp.alt:.1f}m below minimum {constraint.min_altitude:.1f}m",
            )
        if constraint.max_altitude and wp.alt > constraint.max_altitude:
            return _violation(
                constraint,
                f"waypoint at alt {wp.alt:.1f}m above maximum {constraint.max_altitude:.1f}m",
            )

    if ctype == "SPEED":
        if constraint.max_horizontal_speed and wp.speed > constraint.max_horizontal_speed:
            return _violation(
                constraint,
                f"speed {wp.speed:.1f} exceeds max {constraint.max_horizontal_speed:.1f} m/s",
            )

    if ctype == "GEOFENCE" and constraint.boundary:
        wp_ewkt = geojson_to_ewkt(
            {
                "type": "Point",
                "coordinates": [wp.lon, wp.lat, wp.alt],
            }
        )
        contained = db.execute(
            text("SELECT ST_Contains(ST_GeomFromEWKT(:boundary), ST_GeomFromEWKT(:point))"),
            {"boundary": str(constraint.boundary), "point": wp_ewkt},
        ).scalar()

        if not contained:
            return _violation(constraint, "waypoint outside geofence boundary")

    if ctype == "RUNWAY_BUFFER":
        # for MVP, skip detailed runway buffer - would need runway geometry
        pass

    return None


def _check_safety_zone(db: Session, wp, zone: SafetyZone) -> dict | None:
    """check if waypoint is inside an active safety zone"""
    if not zone.geometry:
        return None

    wp_ewkt = geojson_to_ewkt(
        {
            "type": "Point",
            "coordinates": [wp.lon, wp.lat, wp.alt],
        }
    )

    # check 2D containment
    contained = db.execute(
        text("SELECT ST_Contains(:zone_geom, ST_GeomFromEWKT(:point))"),
        {"zone_geom": zone.geometry, "point": wp_ewkt},
    ).scalar()

    if not contained:
        return None

    # check altitude bounds
    if zone.altitude_floor is not None and wp.alt < zone.altitude_floor:
        return None
    if zone.altitude_ceiling is not None and wp.alt > zone.altitude_ceiling:
        return None

    # waypoint is inside the safety zone
    if zone.type in ("PROHIBITED", "TEMPORARY_NO_FLY"):
        return {
            "is_warning": False,
            "message": f"waypoint inside {zone.type} zone: {zone.name}",
            "constraint_id": None,
        }

    # CTR and RESTRICTED are soft warnings
    return {
        "is_warning": True,
        "message": f"waypoint inside {zone.type} zone: {zone.name}",
        "constraint_id": None,
    }


def _violation(constraint: ConstraintRule, message: str) -> dict:
    """create violation dict"""
    return {
        "is_warning": not constraint.is_hard_constraint,
        "message": message,
        "constraint_id": str(constraint.id),
    }
