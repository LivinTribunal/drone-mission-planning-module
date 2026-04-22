from __future__ import annotations

import logging

from shapely.geometry import LineString, Point, Polygon
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.exceptions import TrajectoryGenerationError
from app.models.airport import AirfieldSurface, SafetyZone
from app.models.enums import ConstraintType, SafetyZoneType, SurfaceType, WaypointType
from app.models.flight_plan import ConstraintRule
from app.models.mission import DroneProfile
from app.models.value_objects import Speed
from app.schemas.geometry import parse_ewkb
from app.services.geometry_converter import geojson_to_ewkt

from .types import (
    DEFAULT_RUNWAY_BUFFER,
    HARD_ZONE_TYPES,
    MINIMUM_ALTITUDE_THRESHOLD,
    LocalGeometries,
    LocalObstacle,
    Meters,
    Violation,
    WaypointData,
)

logger = logging.getLogger(__name__)

# waypoint types exempt from AGL minimum check - these literally touch the ground
_GROUND_LEVEL_WAYPOINT_TYPES = (WaypointType.TAKEOFF, WaypointType.LANDING)


def validate_inspection_pass(
    waypoints: list[WaypointData],
    drone: DroneProfile | None,
    constraints: list[ConstraintRule],
    local_geoms: LocalGeometries,
    elevation_provider=None,
    buffer_distance: Meters = 0.0,
    db: Session | None = None,
    boundary_constraint_mode: str = "NONE",
) -> list[Violation]:
    """validate all waypoints in an inspection pass.

    drone and constraint checks run per-waypoint (no spatial queries).
    obstacle and zone checks use Shapely in local coordinates.
    AGL altitude check uses elevation provider for terrain-aware validation.
    buffer_distance inflates obstacle boundaries by this many meters.

    boundary_constraint_mode tunes the outside-boundary warning:
    - NONE: suppressed entirely (operator opted to ignore boundary)
    - INSIDE: downgraded wording (hard constraint already enforced it)
    - OUTSIDE: warning retained (symmetric - waypoint inside boundary is odd)
    default keeps legacy soft-warning behavior.
    """
    violations = []

    for i, wp in enumerate(waypoints):
        if drone:
            violation = check_drone_constraints(wp, drone)
            if violation:
                violation.waypoint_index = i
                violations.append(violation)

        for constraint in constraints:
            violation = _check_constraint(db, wp, constraint, [])
            if violation:
                violation.waypoint_index = i
                violations.append(violation)

    violations.extend(
        _batch_check_obstacles(waypoints, local_geoms, buffer_distance=buffer_distance)
    )
    violations.extend(
        _batch_check_zones(
            waypoints,
            local_geoms,
            boundary_constraint_mode=boundary_constraint_mode,
        )
    )

    # AGL altitude check against terrain
    if elevation_provider:
        violations.extend(_batch_check_minimum_agl(waypoints, elevation_provider))

    return violations


def _batch_check_obstacles(
    waypoints: list[WaypointData],
    local_geoms: LocalGeometries,
    buffer_distance: Meters = 0.0,
) -> list[Violation]:
    """batch obstacle containment using Shapely in local coordinates.

    when buffer_distance > 0, obstacle boundaries are inflated by that many meters.
    falls back to per-obstacle buffer_distance when no override is provided.
    """
    if not local_geoms.obstacles or not waypoints:
        return []

    proj = local_geoms.proj
    violations = []

    for wp_idx, wp in enumerate(waypoints):
        pt = proj.point_to_local(wp.lon, wp.lat)

        for obs in local_geoms.obstacles:
            buf = buffer_distance if buffer_distance > 0 else obs.buffer_distance
            poly = obs.polygon.buffer(buf) if buf > 0 else obs.polygon
            if poly.contains(pt):
                obs_top = obs.base_alt + obs.height
                if wp.alt >= obs.base_alt and wp.alt <= obs_top:
                    violations.append(
                        Violation(
                            is_warning=False,
                            violation_kind="obstacle",
                            message=(
                                f"waypoint at {wp.alt:.0f}m intersects obstacle "
                                f"'{obs.name}' (top: {obs_top:.0f}m)"
                            ),
                            waypoint_index=wp_idx,
                        )
                    )

    return violations


def _batch_check_zones(
    waypoints: list[WaypointData],
    local_geoms: LocalGeometries,
    boundary_constraint_mode: str = "NONE",
) -> list[Violation]:
    """batch safety zone containment using Shapely in local coordinates.

    airport boundary zones are handled with inverted semantics - waypoints
    OUTSIDE the boundary polygon produce soft warnings whose severity is
    tuned by boundary_constraint_mode.
    """
    violations: list[Violation] = []
    violations.extend(
        _batch_check_boundary_zones(
            waypoints,
            local_geoms,
            boundary_constraint_mode=boundary_constraint_mode,
        )
    )

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
    boundary_constraint_mode: str = "NONE",
) -> list[Violation]:
    """warn for waypoints outside the airport boundary polygon.

    mode semantics:
    - NONE: suppressed entirely (operator opted out of boundary awareness)
    - INSIDE: info-level confirmation (hard A* already enforced containment)
    - OUTSIDE or default: legacy soft warning
    """
    if not local_geoms.boundary_zones or not waypoints:
        return []

    # explicit NONE opt-out or OUTSIDE mode (outside is the target) -> suppress
    if boundary_constraint_mode in ("NONE", "OUTSIDE"):
        return []

    proj = local_geoms.proj
    violations: list[Violation] = []

    for boundary in local_geoms.boundary_zones:
        for wp_idx, wp in enumerate(waypoints):
            pt = proj.point_to_local(wp.lon, wp.lat)
            if not boundary.polygon.contains(pt):
                if boundary_constraint_mode == "INSIDE":
                    msg = (
                        f"waypoint outside airport boundary: {boundary.name} "
                        "(info - hard constraint already enforced)"
                    )
                else:
                    msg = f"waypoint outside airport boundary: {boundary.name}"
                violations.append(
                    Violation(
                        is_warning=True,
                        violation_kind="geofence",
                        message=msg,
                        waypoint_index=wp_idx,
                    )
                )

    return violations


def _batch_check_minimum_agl(
    waypoints: list[WaypointData],
    elevation_provider,
    min_agl: float = MINIMUM_ALTITUDE_THRESHOLD,
) -> list[Violation]:
    """check in-flight waypoints maintain minimum height above ground level.

    all AGL violations are soft warnings - PAPI approach paths inherently
    place measurement waypoints below 30m AGL by design (3 deg glide slope
    at ~400m distance = ~21m AGL). transit waypoints are already hard-clamped
    in _adjust_transit_altitude_for_terrain. TAKEOFF and LANDING waypoints
    are exempt by design - they sit on the ground.
    """
    if not waypoints:
        return []

    # pre-filter ground-level waypoints to skip unnecessary elevation lookups
    indexed_wps = [
        (i, wp)
        for i, wp in enumerate(waypoints)
        if wp.waypoint_type not in _GROUND_LEVEL_WAYPOINT_TYPES
    ]
    if not indexed_wps:
        return []

    points = [(wp.lat, wp.lon) for _, wp in indexed_wps]
    elevations = elevation_provider.get_elevations_batch(points)
    if len(elevations) != len(points):
        raise TrajectoryGenerationError(f"expected {len(points)} elevations, got {len(elevations)}")

    violations = []
    for (i, wp), ground in zip(indexed_wps, elevations):
        agl = wp.alt - ground
        if agl < min_agl:
            violations.append(
                Violation(
                    is_warning=True,
                    violation_kind="altitude",
                    message=(
                        f"{wp.waypoint_type} at {wp.alt:.0f}m is only {agl:.1f}m AGL "
                        f"(min {min_agl:.0f}m)"
                    ),
                    waypoint_index=i,
                )
            )

    return violations


def check_drone_constraints(wp: WaypointData, drone: DroneProfile) -> Violation | None:
    """check if waypoint exceeds drone altitude or speed limits."""
    if drone.max_altitude is not None and wp.alt > drone.max_altitude:
        return Violation(
            is_warning=False,
            violation_kind="drone",
            message=(
                f"waypoint alt {wp.alt:.0f}m exceeds drone max altitude {drone.max_altitude:.0f}m"
            ),
        )

    # validate speed as value object
    try:
        Speed(wp.speed)
    except ValueError:
        return Violation(
            is_warning=False, violation_kind="drone", message=f"invalid speed value: {wp.speed}"
        )

    if drone.max_speed is not None and wp.speed > drone.max_speed:
        return Violation(
            is_warning=False,
            violation_kind="drone",
            message=(
                f"waypoint speed {wp.speed:.1f} m/s exceeds "
                f"drone max speed {drone.max_speed:.1f} m/s"
            ),
        )

    return None


def check_obstacle(
    wp_x: float,
    wp_y: float,
    wp_alt: float,
    obstacle: LocalObstacle,
    buffer_distance: Meters = 0.0,
) -> bool:
    """check if waypoint is inside an obstacle's buffered boundary below its height."""
    buf = buffer_distance if buffer_distance > 0 else obstacle.buffer_distance
    poly = obstacle.polygon.buffer(buf) if buf > 0 else obstacle.polygon
    if not poly.contains(Point(wp_x, wp_y)):
        return False
    obs_top = obstacle.base_alt + obstacle.height
    return wp_alt >= obstacle.base_alt and wp_alt <= obs_top


def check_battery(
    cumulative_duration_s: float,
    drone: DroneProfile | None,
    reserve_margin: float = 0.15,
) -> Violation | None:
    """soft warning if cumulative flight time exceeds battery capacity"""
    if not drone or drone.endurance_minutes is None:
        return None

    available_s = drone.endurance_minutes * 60 * (1 - reserve_margin)
    if cumulative_duration_s > available_s:
        return Violation(
            is_warning=True,
            violation_kind="battery",
            message=(
                f"estimated flight time {cumulative_duration_s:.0f}s exceeds "
                f"battery capacity {available_s:.0f}s "
                f"(with {reserve_margin:.0%} reserve)"
            ),
        )

    return None


# Shapely-based segment intersection functions (replace PostGIS equivalents)


def segments_intersect_obstacle(
    from_x: float,
    from_y: float,
    to_x: float,
    to_y: float,
    obstacle: LocalObstacle,
    buffer_distance: Meters = 0.0,
) -> bool:
    """check if a line segment intersects an obstacle's buffered 2D boundary."""
    buf = buffer_distance if buffer_distance > 0 else obstacle.buffer_distance
    poly = obstacle.polygon.buffer(buf) if buf > 0 else obstacle.polygon
    line = LineString([(from_x, from_y), (to_x, to_y)])
    return line.intersects(poly)


def segments_intersect_zone(
    from_x: float,
    from_y: float,
    to_x: float,
    to_y: float,
    zone_polygon: Polygon,
) -> bool:
    """check if a line segment intersects a safety zone's 2D footprint."""
    line = LineString([(from_x, from_y), (to_x, to_y)])
    return line.intersects(zone_polygon)


def segment_runway_crossing_length(
    from_x: float,
    from_y: float,
    to_x: float,
    to_y: float,
    surface_polygon,
) -> float:
    """length in meters of segment inside a runway's buffered area.

    uses pre-built Shapely polygon (buffered centerline). returns 0 if no crossing.
    """
    line = LineString([(from_x, from_y), (to_x, to_y)])
    if not line.intersects(surface_polygon):
        return 0.0
    intersection = line.intersection(surface_polygon)
    return intersection.length


# PostGIS-based functions kept for standalone use outside trajectory generation


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


def _check_constraint(
    db: Session | None,
    wp: WaypointData,
    constraint: ConstraintRule,
    surfaces: list[AirfieldSurface],
) -> Violation | None:
    """dispatch waypoint check based on constraint type"""
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


def _check_runway_buffer(
    db: Session,
    wp: WaypointData,
    constraint: ConstraintRule,
    surfaces: list[AirfieldSurface],
) -> Violation | None:
    """check if waypoint is within lateral buffer of a runway centerline"""
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
            return _violation(
                constraint,
                f"waypoint within {buffer_m:.0f}m of runway {surface.identifier}",
            )

    return None


def _wp_to_ewkt(wp) -> str:
    """convert waypoint position to EWKT point string"""
    return geojson_to_ewkt({"type": "Point", "coordinates": [wp.lon, wp.lat, wp.alt]})


def _geom_to_ewkt(geom) -> str:
    """convert WKBElement to EWKT string for use in text() queries"""
    try:
        geojson = parse_ewkb(geom.data)
        return geojson_to_ewkt(geojson)
    except Exception as e:
        raise TrajectoryGenerationError(f"failed to parse geometry: {e}") from e


def _violation(constraint: ConstraintRule, message: str) -> Violation:
    """create a violation from a constraint, inheriting its hard/soft flag"""
    return Violation(
        is_warning=not constraint.is_hard_constraint,
        violation_kind="constraint",
        message=message,
        constraint_id=str(constraint.id),
    )
