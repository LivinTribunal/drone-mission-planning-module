import logging
import os
import time
from uuid import UUID

import httpx
from geoalchemy2.elements import WKTElement
from sqlalchemy import cast, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session, joinedload

from app.core.config import TERRAIN_DIR, settings
from app.core.exceptions import ConflictError, DomainError, NotFoundError
from app.models.agl import AGL, LHA
from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.enums import MissionStatus, SafetyZoneType
from app.models.inspection import InspectionConfiguration
from app.models.mission import DroneProfile, Mission
from app.schemas.airport import AirportCreate, AirportSummaryResponse, AirportUpdate
from app.schemas.geometry import PolygonZ, parse_ewkb
from app.schemas.infrastructure import (
    AGLCreate,
    AGLUpdate,
    LHABulkGenerateRequest,
    LHACreate,
    LHAUpdate,
    ObstacleCreate,
    ObstacleUpdate,
    SafetyZoneCreate,
    SafetyZoneUpdate,
    SurfaceCreate,
    SurfaceUpdate,
)
from app.services.elevation_provider import create_elevation_provider
from app.services.geometry_converter import (
    apply_schema_update,
    geojson_to_ewkt,
    schema_to_model_data,
)
from app.utils.geo import polygon_oriented_dimensions

logger = logging.getLogger(__name__)


# airports
def list_airports(db: Session, airport_ids: list[UUID] | None = None) -> list[Airport]:
    """list airports, optionally filtered by id list."""
    query = db.query(Airport)
    if airport_ids is not None:
        query = query.filter(Airport.id.in_(airport_ids))
    return query.all()


def list_airports_with_counts(
    db: Session, airport_ids: list[UUID] | None = None
) -> list[AirportSummaryResponse]:
    """list airports with infrastructure and mission counts, optionally filtered."""
    surfaces_sub = (
        db.query(
            AirfieldSurface.airport_id,
            func.count(AirfieldSurface.id).label("surfaces_count"),
        )
        .group_by(AirfieldSurface.airport_id)
        .subquery()
    )

    agls_sub = (
        db.query(
            AirfieldSurface.airport_id,
            func.count(AGL.id).label("agls_count"),
        )
        .join(AGL, AGL.surface_id == AirfieldSurface.id)
        .group_by(AirfieldSurface.airport_id)
        .subquery()
    )

    missions_sub = (
        db.query(
            Mission.airport_id,
            func.count(Mission.id).label("missions_count"),
        )
        .group_by(Mission.airport_id)
        .subquery()
    )

    query = (
        db.query(
            Airport,
            func.coalesce(surfaces_sub.c.surfaces_count, 0).label("surfaces_count"),
            func.coalesce(agls_sub.c.agls_count, 0).label("agls_count"),
            func.coalesce(missions_sub.c.missions_count, 0).label("missions_count"),
        )
        .outerjoin(surfaces_sub, Airport.id == surfaces_sub.c.airport_id)
        .outerjoin(agls_sub, Airport.id == agls_sub.c.airport_id)
        .outerjoin(missions_sub, Airport.id == missions_sub.c.airport_id)
    )
    if airport_ids is not None:
        query = query.filter(Airport.id.in_(airport_ids))
    rows = query.all()

    results = []
    for airport, s_count, a_count, m_count in rows:
        data = AirportSummaryResponse.model_validate(airport, from_attributes=True)
        data.surfaces_count = s_count
        data.agls_count = a_count
        data.missions_count = m_count
        results.append(data)

    return results


def get_airport(db: Session, airport_id: UUID) -> Airport:
    """get airport with nested infrastructure"""
    airport = (
        db.query(Airport)
        .options(
            joinedload(Airport.surfaces).joinedload(AirfieldSurface.agls).joinedload(AGL.lhas),
            joinedload(Airport.obstacles),
            joinedload(Airport.safety_zones),
        )
        .filter(Airport.id == airport_id)
        .first()
    )
    if not airport:
        raise NotFoundError("airport not found")

    return airport


def create_airport(db: Session, schema: AirportCreate) -> Airport:
    """create airport - icao validation happens at the schema layer."""
    airport = Airport(**schema_to_model_data(schema))
    db.add(airport)
    db.commit()
    db.refresh(airport)

    return airport


def update_airport(db: Session, airport_id: UUID, schema: AirportUpdate) -> Airport:
    """update airport"""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    # detect elevation-related field changes before applying update
    elevation_fields = {"elevation", "terrain_source", "dem_file_path"}
    elevation_changed = bool(schema.model_fields_set & elevation_fields)

    # value objects are immutable, ORM models are mutable - updates apply to ORM instances
    apply_schema_update(airport, schema)

    if elevation_changed:
        # flush instead of commit so both the airport update and renormalization
        # happen in a single transaction - avoids stale position.z on partial failure
        db.flush()
        renormalize_airport_altitudes(db, airport_id)
    else:
        db.commit()

    db.refresh(airport)

    return airport


def delete_airport(db: Session, airport_id: UUID):
    """delete airport"""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    db.delete(airport)
    db.flush()


def set_default_drone(db: Session, airport_id: UUID, drone_profile_id: UUID | None) -> Airport:
    """set or clear the default drone profile for an airport."""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    if drone_profile_id:
        drone = db.query(DroneProfile).filter(DroneProfile.id == drone_profile_id).first()
        if not drone:
            raise DomainError("drone profile not found")

    airport.default_drone_profile_id = drone_profile_id
    db.commit()
    db.refresh(airport)

    return airport


def bulk_change_drone(
    db: Session,
    airport_id: UUID,
    drone_profile_id: UUID,
    from_drone_id: UUID | None = None,
    scope: str = "ALL_DRAFT",
    mission_ids: list[UUID] | None = None,
) -> tuple[int, int, list[UUID]]:
    """change drone profile on missions at an airport.

    scope ALL_DRAFT updates all draft missions (optionally filtered by from_drone_id).
    scope SELECTED updates only the listed mission_ids (draft + planned allowed).
    """
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    drone = db.query(DroneProfile).filter(DroneProfile.id == drone_profile_id).first()
    if not drone:
        raise DomainError("drone profile not found")

    updated_ids: list[UUID] = []
    regressed_count = 0

    if scope == "SELECTED":
        if not mission_ids:
            return 0, 0, []
        missions = (
            db.query(Mission)
            .filter(
                Mission.airport_id == airport_id,
                Mission.id.in_(mission_ids),
                Mission.status.in_([MissionStatus.DRAFT, MissionStatus.PLANNED]),
            )
            .all()
        )
        for mission in missions:
            was_planned = mission.status == MissionStatus.PLANNED
            mission.change_drone_profile(drone_profile_id)
            updated_ids.append(mission.id)
            if was_planned:
                regressed_count += 1
    else:
        # ALL_DRAFT
        query = db.query(Mission).filter(
            Mission.airport_id == airport_id, Mission.status == MissionStatus.DRAFT
        )
        if from_drone_id:
            query = query.filter(Mission.drone_profile_id == from_drone_id)
        draft_missions = query.all()
        for mission in draft_missions:
            mission.change_drone_profile(drone_profile_id)
            updated_ids.append(mission.id)

    db.commit()

    return len(updated_ids), regressed_count, updated_ids


# surfaces
def list_surfaces(db: Session, airport_id: UUID) -> list[AirfieldSurface]:
    """list surfaces for airport"""
    return (
        db.query(AirfieldSurface)
        .options(joinedload(AirfieldSurface.agls).joinedload(AGL.lhas))
        .filter(AirfieldSurface.airport_id == airport_id)
        .all()
    )


def create_surface(db: Session, airport_id: UUID, schema: SurfaceCreate) -> AirfieldSurface:
    """create surface via airport aggregate root."""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    data = schema_to_model_data(schema)
    surface = AirfieldSurface(**data)
    airport.add_surface(surface)
    db.commit()
    db.refresh(surface)

    return surface


def update_surface(
    db: Session, airport_id: UUID, surface_id: UUID, schema: SurfaceUpdate
) -> AirfieldSurface:
    """update surface, validates it belongs to airport"""
    surface = (
        db.query(AirfieldSurface)
        .filter(AirfieldSurface.id == surface_id, AirfieldSurface.airport_id == airport_id)
        .first()
    )
    if not surface:
        raise NotFoundError("surface not found")

    apply_schema_update(surface, schema)
    db.commit()
    db.refresh(surface)

    return surface


def delete_surface(db: Session, airport_id: UUID, surface_id: UUID):
    """delete surface, validates it belongs to airport"""
    surface = (
        db.query(AirfieldSurface)
        .filter(AirfieldSurface.id == surface_id, AirfieldSurface.airport_id == airport_id)
        .first()
    )
    if not surface:
        raise NotFoundError("surface not found")

    db.delete(surface)
    db.commit()


def recalculate_surface_dimensions(db: Session, airport_id: UUID, surface_id: UUID) -> dict:
    """compute surface length/width/heading from geometry, returns current + recalculated."""
    surface = (
        db.query(AirfieldSurface)
        .filter(AirfieldSurface.id == surface_id, AirfieldSurface.airport_id == airport_id)
        .first()
    )
    if not surface:
        raise NotFoundError("surface not found")

    return {
        "current": {
            "length": surface.length,
            "width": surface.width,
            "heading": surface.heading,
        },
        "recalculated": surface.recalculate_dimensions(),
    }


# obstacles


def _normalize_position_altitude(position_coords: list[float], airport: Airport) -> None:
    """set position Z to ground elevation so objects sit at ground level."""
    if len(position_coords) < 3:
        return
    provider = create_elevation_provider(airport)
    try:
        ground = provider.get_elevation(position_coords[1], position_coords[0])
        position_coords[2] = ground
    finally:
        if hasattr(provider, "close"):
            provider.close()


def renormalize_airport_altitudes(db: Session, airport_id: UUID) -> dict[str, list[UUID]]:
    """re-normalize all position.z values for obstacles, agls, and lhas at airport.

    returns a dict of skipped entity ids per type so callers can surface partial
    failures - per-item errors are logged and the loop continues so one bad
    geometry does not block the rest of the airport.
    """
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    skipped: dict[str, list[UUID]] = {"obstacles": [], "agls": [], "lhas": []}

    provider = create_elevation_provider(airport)
    try:
        obstacles = db.query(Obstacle).filter(Obstacle.airport_id == airport_id).all()

        agls = (
            db.query(AGL)
            .join(AirfieldSurface, AGL.surface_id == AirfieldSurface.id)
            .filter(AirfieldSurface.airport_id == airport_id)
            .all()
        )

        lhas = (
            db.query(LHA)
            .join(AGL, LHA.agl_id == AGL.id)
            .join(AirfieldSurface, AGL.surface_id == AirfieldSurface.id)
            .filter(AirfieldSurface.airport_id == airport_id)
            .all()
        )

        # renormalize obstacle boundary z-coordinates (outer ring only)
        for obs in obstacles:
            try:
                geojson = parse_ewkb(obs.boundary.data)
                ring = geojson.get("coordinates", [[]])[0]
                if not ring:
                    continue
                parts = []
                for c in ring:
                    lon, lat = c[0], c[1]
                    ground = provider.get_elevation(lat, lon)
                    parts.append(f"{lon} {lat} {ground}")
                wkt_ring = ", ".join(parts)
                obs.boundary = WKTElement(f"SRID=4326;POLYGONZ(({wkt_ring}))", srid=4326)
            except Exception as e:
                logger.warning("skipping renormalization for Obstacle %s: %s", obs.id, e)
                skipped["obstacles"].append(obs.id)
                continue

        # renormalize AGL and LHA position.z
        for entity in [*agls, *lhas]:
            bucket = "agls" if isinstance(entity, AGL) else "lhas"
            try:
                coords = parse_ewkb(entity.position.data).get("coordinates", [])
                if len(coords) < 3:
                    continue
                lon, lat = coords[0], coords[1]
                ground = provider.get_elevation(lat, lon)
                entity.position = WKTElement(f"SRID=4326;POINTZ({lon} {lat} {ground})", srid=4326)
            except Exception as e:
                logger.warning(
                    "skipping renormalization for %s %s: %s",
                    type(entity).__name__,
                    entity.id,
                    e,
                )
                skipped[bucket].append(entity.id)
                continue

        db.commit()

        if any(skipped.values()):
            logger.warning(
                "renormalize_airport_altitudes for %s left partial state: %s",
                airport_id,
                {k: len(v) for k, v in skipped.items() if v},
            )

        return skipped
    finally:
        if hasattr(provider, "close"):
            provider.close()


def list_obstacles(db: Session, airport_id: UUID) -> list[Obstacle]:
    """list obstacles for airport"""
    return db.query(Obstacle).filter(Obstacle.airport_id == airport_id).all()


def _normalize_boundary_altitude(boundary: PolygonZ | None, airport: Airport) -> None:
    """set all boundary ring z-coordinates to ground elevation."""
    if not boundary or not boundary.coordinates:
        return
    ring = boundary.coordinates[0]
    if not ring:
        return
    provider = create_elevation_provider(airport)
    try:
        for j, coord in enumerate(ring):
            if len(coord) >= 3:
                ground = provider.get_elevation(coord[1], coord[0])
                ring[j] = list(coord[:2]) + [ground]
    finally:
        if hasattr(provider, "close"):
            provider.close()


def _derive_position_and_radius(boundary: PolygonZ) -> tuple[WKTElement, float]:
    """compute centroid position and radius from a polygon boundary."""
    ring = boundary.coordinates[0]
    pts = ring[:-1] if len(ring) >= 2 and ring[0] == ring[-1] else list(ring)
    n = len(pts)
    lon = sum(p[0] for p in pts) / n
    lat = sum(p[1] for p in pts) / n
    alt = sum((p[2] if len(p) >= 3 else 0) for p in pts) / n
    centroid_geojson = {"type": "Point", "coordinates": [lon, lat, alt]}
    position = WKTElement(geojson_to_ewkt(centroid_geojson), srid=4326)

    _, width, _ = polygon_oriented_dimensions(ring)
    radius = width / 2.0 if width > 0 else 0.0

    return position, radius


def create_obstacle(db: Session, airport_id: UUID, schema: ObstacleCreate) -> Obstacle:
    """create obstacle via airport aggregate root."""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    # normalize boundary z-coordinates to ground elevation
    _normalize_boundary_altitude(schema.boundary, airport)

    data = schema_to_model_data(schema)
    position, radius = _derive_position_and_radius(schema.boundary)
    data["position"] = position
    data["radius"] = radius
    obstacle = Obstacle(**data)
    airport.add_obstacle(obstacle)
    db.commit()
    db.refresh(obstacle)

    return obstacle


def update_obstacle(
    db: Session, airport_id: UUID, obstacle_id: UUID, schema: ObstacleUpdate
) -> Obstacle:
    """update obstacle, validates it belongs to airport."""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    obstacle = (
        db.query(Obstacle)
        .filter(Obstacle.id == obstacle_id, Obstacle.airport_id == airport_id)
        .first()
    )
    if not obstacle:
        raise NotFoundError("obstacle not found")

    # normalize boundary z-coordinates unless coordinator explicitly preserves altitude
    if schema.boundary and schema.boundary.coordinates and not schema.preserve_altitude:
        _normalize_boundary_altitude(schema.boundary, airport)

    apply_schema_update(obstacle, schema)

    # recompute position/radius when boundary changes
    if schema.boundary and schema.boundary.coordinates:
        position, radius = _derive_position_and_radius(schema.boundary)
        obstacle.position = position
        obstacle.radius = radius

    db.commit()
    db.refresh(obstacle)

    return obstacle


def delete_obstacle(db: Session, airport_id: UUID, obstacle_id: UUID):
    """delete obstacle, validates it belongs to airport"""
    obstacle = (
        db.query(Obstacle)
        .filter(Obstacle.id == obstacle_id, Obstacle.airport_id == airport_id)
        .first()
    )
    if not obstacle:
        raise NotFoundError("obstacle not found")

    db.delete(obstacle)
    db.commit()


def recalculate_obstacle_dimensions(db: Session, airport_id: UUID, obstacle_id: UUID) -> dict:
    """compute obstacle dimensions from boundary, returns current + recalculated."""
    obstacle = (
        db.query(Obstacle)
        .filter(Obstacle.id == obstacle_id, Obstacle.airport_id == airport_id)
        .first()
    )
    if not obstacle:
        raise NotFoundError("obstacle not found")

    recalculated = obstacle.recalculate_dimensions()
    # obstacles have no stored length/width/heading/radius columns - all dimensions
    # are derived from the boundary polygon, so "current" is always None
    return {
        "current": {
            "length": None,
            "width": None,
            "heading": None,
            "radius": None,
        },
        "recalculated": recalculated,
    }


# safety zones
def list_safety_zones(db: Session, airport_id: UUID) -> list[SafetyZone]:
    """list safety zones for airport"""
    return db.query(SafetyZone).filter(SafetyZone.airport_id == airport_id).all()


def create_safety_zone(db: Session, airport_id: UUID, schema: SafetyZoneCreate) -> SafetyZone:
    """create safety zone via airport aggregate root."""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    data = schema_to_model_data(schema)
    zone = SafetyZone(**data)
    airport.add_safety_zone(zone)
    db.commit()
    db.refresh(zone)

    return zone


def update_safety_zone(
    db: Session, airport_id: UUID, zone_id: UUID, schema: SafetyZoneUpdate
) -> SafetyZone:
    """update safety zone, validates it belongs to airport"""
    zone = (
        db.query(SafetyZone)
        .filter(SafetyZone.id == zone_id, SafetyZone.airport_id == airport_id)
        .first()
    )
    if not zone:
        raise NotFoundError("safety zone not found")

    # enforce max-one-boundary invariant when switching a non-boundary zone to AIRPORT_BOUNDARY
    if (
        schema.type == SafetyZoneType.AIRPORT_BOUNDARY.value
        and zone.type != SafetyZoneType.AIRPORT_BOUNDARY.value
    ):
        existing = (
            db.query(SafetyZone)
            .filter(
                SafetyZone.airport_id == airport_id,
                SafetyZone.type == SafetyZoneType.AIRPORT_BOUNDARY.value,
                SafetyZone.id != zone_id,
            )
            .first()
        )
        if existing:
            raise ConflictError("Airport boundary already exists. Delete the existing one first.")

    # determine target type - schema.type may be None on partial update
    target_type = schema.type if schema.type is not None else zone.type

    # boundary zones ignore altitude band - reject altitude payload for clarity
    if target_type == SafetyZoneType.AIRPORT_BOUNDARY.value:
        if schema.altitude_floor is not None or schema.altitude_ceiling is not None:
            raise DomainError(
                "altitude_floor and altitude_ceiling are not allowed for AIRPORT_BOUNDARY zones"
            )

    apply_schema_update(zone, schema)

    # cross-field check after merge - partial updates can invert the envelope
    if (
        zone.altitude_floor is not None
        and zone.altitude_ceiling is not None
        and zone.altitude_floor > zone.altitude_ceiling
    ):
        raise DomainError("altitude_floor must be <= altitude_ceiling", status_code=422)

    db.commit()
    db.refresh(zone)

    return zone


def delete_safety_zone(db: Session, airport_id: UUID, zone_id: UUID):
    """delete safety zone, validates it belongs to airport"""
    zone = (
        db.query(SafetyZone)
        .filter(SafetyZone.id == zone_id, SafetyZone.airport_id == airport_id)
        .first()
    )
    if not zone:
        raise NotFoundError("safety zone not found")

    db.delete(zone)
    db.commit()


# AGLs
def list_agls(db: Session, airport_id: UUID, surface_id: UUID) -> list[AGL]:
    """list AGLs for surface, validates surface belongs to airport."""
    surface = (
        db.query(AirfieldSurface)
        .filter(AirfieldSurface.id == surface_id, AirfieldSurface.airport_id == airport_id)
        .first()
    )
    if not surface:
        raise NotFoundError("surface not found")

    return db.query(AGL).options(joinedload(AGL.lhas)).filter(AGL.surface_id == surface_id).all()


def create_agl(db: Session, airport_id: UUID, surface_id: UUID, schema: AGLCreate) -> AGL:
    """create AGL for surface, validates surface belongs to airport."""
    surface = (
        db.query(AirfieldSurface)
        .filter(AirfieldSurface.id == surface_id, AirfieldSurface.airport_id == airport_id)
        .first()
    )
    if not surface:
        raise NotFoundError("surface not found")

    # normalize position.z to ground elevation at AGL location
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")
    if schema.position and schema.position.coordinates:
        _normalize_position_altitude(schema.position.coordinates, airport)

    data = schema_to_model_data(schema)
    agl = AGL(surface_id=surface_id, **data)
    db.add(agl)
    db.commit()
    db.refresh(agl)

    return agl


def update_agl(
    db: Session, airport_id: UUID, surface_id: UUID, agl_id: UUID, schema: AGLUpdate
) -> AGL:
    """update AGL, validates surface belongs to airport and AGL belongs to surface."""
    surface = (
        db.query(AirfieldSurface)
        .filter(AirfieldSurface.id == surface_id, AirfieldSurface.airport_id == airport_id)
        .first()
    )
    if not surface:
        raise NotFoundError("surface not found")

    agl = db.query(AGL).filter(AGL.id == agl_id, AGL.surface_id == surface_id).first()
    if not agl:
        raise NotFoundError("agl not found")

    # normalize position.z to ground unless coordinator explicitly preserves altitude
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")
    if schema.position and schema.position.coordinates and not schema.preserve_altitude:
        _normalize_position_altitude(schema.position.coordinates, airport)

    apply_schema_update(agl, schema)
    db.commit()
    db.refresh(agl)

    return agl


def delete_agl(db: Session, airport_id: UUID, surface_id: UUID, agl_id: UUID):
    """delete AGL, validates surface belongs to airport and AGL belongs to surface."""
    surface = (
        db.query(AirfieldSurface)
        .filter(AirfieldSurface.id == surface_id, AirfieldSurface.airport_id == airport_id)
        .first()
    )
    if not surface:
        raise NotFoundError("surface not found")

    agl = db.query(AGL).filter(AGL.id == agl_id, AGL.surface_id == surface_id).first()
    if not agl:
        raise NotFoundError("agl not found")

    db.delete(agl)
    db.commit()


# LHAs
def list_lhas(db: Session, airport_id: UUID, surface_id: UUID, agl_id: UUID) -> list[LHA]:
    """list LHAs for AGL, validates surface belongs to airport."""
    surface = (
        db.query(AirfieldSurface)
        .filter(AirfieldSurface.id == surface_id, AirfieldSurface.airport_id == airport_id)
        .first()
    )
    if not surface:
        raise NotFoundError("surface not found")

    agl = db.query(AGL).filter(AGL.id == agl_id, AGL.surface_id == surface_id).first()
    if not agl:
        raise NotFoundError("agl not found")

    return db.query(LHA).filter(LHA.agl_id == agl_id).all()


def create_lha(
    db: Session, airport_id: UUID, surface_id: UUID, agl_id: UUID, schema: LHACreate
) -> LHA:
    """create LHA for AGL, validates surface belongs to airport."""
    surface = (
        db.query(AirfieldSurface)
        .filter(AirfieldSurface.id == surface_id, AirfieldSurface.airport_id == airport_id)
        .first()
    )
    if not surface:
        raise NotFoundError("surface not found")

    agl = db.query(AGL).filter(AGL.id == agl_id, AGL.surface_id == surface_id).first()
    if not agl:
        raise NotFoundError("agl not found")

    # normalize position.z to ground elevation at LHA location
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")
    if schema.position and schema.position.coordinates:
        _normalize_position_altitude(schema.position.coordinates, airport)

    data = schema_to_model_data(schema)
    lha = LHA(agl_id=agl_id, **data)
    db.add(lha)
    db.commit()
    db.refresh(lha)

    return lha


def update_lha(
    db: Session, airport_id: UUID, surface_id: UUID, agl_id: UUID, lha_id: UUID, schema: LHAUpdate
) -> LHA:
    """update LHA, validates surface belongs to airport and LHA belongs to AGL."""
    surface = (
        db.query(AirfieldSurface)
        .filter(AirfieldSurface.id == surface_id, AirfieldSurface.airport_id == airport_id)
        .first()
    )
    if not surface:
        raise NotFoundError("surface not found")

    agl = db.query(AGL).filter(AGL.id == agl_id, AGL.surface_id == surface_id).first()
    if not agl:
        raise NotFoundError("agl not found")

    lha = db.query(LHA).filter(LHA.id == lha_id, LHA.agl_id == agl_id).first()
    if not lha:
        raise NotFoundError("lha not found")

    # normalize position.z to ground unless coordinator explicitly preserves altitude
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")
    if schema.position and schema.position.coordinates and not schema.preserve_altitude:
        _normalize_position_altitude(schema.position.coordinates, airport)

    apply_schema_update(lha, schema)
    db.commit()
    db.refresh(lha)

    return lha


def delete_lha(db: Session, airport_id: UUID, surface_id: UUID, agl_id: UUID, lha_id: UUID):
    """delete LHA, renumber remaining LHAs, and clean up inspection config refs."""
    surface = (
        db.query(AirfieldSurface)
        .filter(AirfieldSurface.id == surface_id, AirfieldSurface.airport_id == airport_id)
        .first()
    )
    if not surface:
        raise NotFoundError("surface not found")

    agl = db.query(AGL).filter(AGL.id == agl_id, AGL.surface_id == surface_id).first()
    if not agl:
        raise NotFoundError("agl not found")

    lha = db.query(LHA).filter(LHA.id == lha_id, LHA.agl_id == agl_id).first()
    if not lha:
        raise NotFoundError("lha not found")

    deleted_id_str = str(lha.id)
    db.delete(lha)
    db.flush()

    # renumber remaining LHAs to keep unit_number contiguous
    remaining = db.query(LHA).filter(LHA.agl_id == agl_id).order_by(LHA.unit_number.asc()).all()
    for idx, item in enumerate(remaining, start=1):
        if item.unit_number != idx:
            item.unit_number = idx

    # drop deleted id from any inspection configs that reference it.
    # scoped by jsonb containment so we only touch configs that actually hold this id -
    # avoids the full-table scan we'd get from loading every config with non-null lha_ids.
    configs = (
        db.query(InspectionConfiguration)
        .filter(InspectionConfiguration.lha_ids.op("@>")(cast([deleted_id_str], JSONB)))
        .all()
    )
    for cfg in configs:
        ids = cfg.lha_ids or []
        cfg.lha_ids = [i for i in ids if i != deleted_id_str]

    db.commit()


def bulk_generate_lhas(
    db: Session,
    airport_id: UUID,
    surface_id: UUID,
    agl_id: UUID,
    schema: LHABulkGenerateRequest,
) -> list[LHA]:
    """linearly interpolate LHAs between two points spaced by spacing_m meters."""
    from app.utils.geo import distance_between

    surface = (
        db.query(AirfieldSurface)
        .filter(AirfieldSurface.id == surface_id, AirfieldSurface.airport_id == airport_id)
        .first()
    )
    if not surface:
        raise NotFoundError("surface not found")

    agl = db.query(AGL).filter(AGL.id == agl_id, AGL.surface_id == surface_id).first()
    if not agl:
        raise NotFoundError("agl not found")

    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    first = schema.first_position.coordinates
    last = schema.last_position.coordinates
    if len(first) < 3 or len(last) < 3:
        raise DomainError("positions must include lon, lat, and altitude", status_code=422)

    total_distance = distance_between(first[0], first[1], last[0], last[1])
    if total_distance <= 0:
        raise DomainError("first and last positions must differ", status_code=422)

    # start numbering after any existing LHAs - append-only semantics: calling
    # this twice on the same AGL extends numbering past existing units and
    # counts toward the cumulative 200-cap
    existing_count = db.query(LHA).filter(LHA.agl_id == agl_id).count()

    # number of LHAs, bounded to avoid runaway generation, enforcing cumulative cap
    count = max(2, int(round(total_distance / schema.spacing_m)) + 1)
    remaining_slots = max(0, 200 - existing_count)
    if remaining_slots < 2:
        raise DomainError(
            "agl already has 200 lha units - delete some before generating more",
            status_code=422,
        )
    count = min(count, remaining_slots)

    # default angle: RUNWAY_EDGE_LIGHTS uses 0, PAPI stays null for coordinator fill-in
    is_edge_lights = agl.agl_type == "RUNWAY_EDGE_LIGHTS"
    if schema.setting_angle is not None:
        setting_angle = schema.setting_angle
    elif is_edge_lights:
        setting_angle = 0.0
    else:
        setting_angle = None

    # reuse one provider across the loop - DEM-backed providers open a
    # rasterio handle per instance, so creating one per iteration would
    # re-open the file up to 200 times in a single request
    provider = create_elevation_provider(airport)
    try:
        created: list[LHA] = []
        for i in range(count):
            # count is bounded to >= 2 above, so (count - 1) is always positive
            t = i / (count - 1)
            lon = first[0] + (last[0] - first[0]) * t
            lat = first[1] + (last[1] - first[1]) * t
            ground = provider.get_elevation(lat, lon)

            wkt = f"SRID=4326;POINTZ({lon} {lat} {ground})"
            lha = LHA(
                agl_id=agl_id,
                unit_number=existing_count + i + 1,
                setting_angle=setting_angle,
                lamp_type=schema.lamp_type,
                position=WKTElement(wkt, srid=4326),
                tolerance=schema.tolerance if schema.tolerance is not None else 0.2,
            )
            db.add(lha)
            created.append(lha)

        db.commit()
        for lha in created:
            db.refresh(lha)

        return created
    finally:
        if hasattr(provider, "close"):
            provider.close()


# terrain
def upload_terrain_dem(
    db: Session,
    airport_id: UUID,
    file_path: str,
    terrain_source: str = "DEM_UPLOAD",
) -> Airport:
    """set airport terrain source after file upload or API download."""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    old_path = airport.dem_file_path

    airport.terrain_source = terrain_source
    airport.dem_file_path = file_path
    db.commit()
    db.refresh(airport)

    # clean up old DEM file only after successful commit
    if old_path and old_path != file_path and os.path.exists(old_path):
        try:
            os.unlink(old_path)
        except OSError:
            logger.warning("failed to remove old DEM file: %s", old_path)

    return airport


def get_dem_file_path(db: Session, airport_id: UUID) -> str | None:
    """get dem_file_path for an airport without eager-loading infrastructure."""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")
    return airport.dem_file_path


def delete_terrain_dem(db: Session, airport_id: UUID) -> Airport:
    """reset airport terrain source to FLAT and remove DEM path."""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    airport.terrain_source = "FLAT"
    airport.dem_file_path = None
    db.commit()
    db.refresh(airport)

    return airport


def get_airport_lonlat(airport: Airport) -> tuple[float, float]:
    """extract lon, lat from airport location geometry."""
    loc = airport.location
    if hasattr(loc, "data"):
        parsed = parse_ewkb(loc.data)
        coords = parsed.get("coordinates", [])
        if len(coords) < 2:
            raise DomainError("airport location is missing coordinates", status_code=400)
        return coords[0], coords[1]

    coords = loc.get("coordinates", [])
    if len(coords) < 2:
        raise DomainError("airport location is missing coordinates", status_code=400)
    return coords[0], coords[1]


def download_terrain_for_location(
    airport_id: UUID,
    apt_lon: float,
    apt_lat: float,
    fallback_elevation: float,
) -> dict:
    """download elevation data from open-elevation API and cache as geotiff.

    session-free - safe to call from a thread pool executor.
    returns file metadata dict; caller is responsible for persisting to db.
    """
    try:
        import numpy as np
        import rasterio
        from rasterio.transform import from_bounds
    except ImportError as e:
        raise DomainError(
            "rasterio/numpy not installed - terrain download not available",
            status_code=501,
        ) from e

    delta_deg = settings.terrain_grid_delta_deg
    min_lon = apt_lon - delta_deg
    max_lon = apt_lon + delta_deg
    min_lat = apt_lat - delta_deg
    max_lat = apt_lat + delta_deg

    step = settings.terrain_grid_step_deg
    lats = []
    lons = []
    lat = min_lat
    while lat <= max_lat:
        lats.append(lat)
        lat += step
    lon = min_lon
    while lon <= max_lon:
        lons.append(lon)
        lon += step

    # build locations for API query
    locations = []
    for la in lats:
        for lo in lons:
            locations.append({"latitude": round(la, 6), "longitude": round(lo, 6)})

    # batch query open-elevation API
    batch_size = settings.terrain_api_batch_size
    all_elevations = []
    total_timeout = settings.terrain_download_timeout
    start_time = time.monotonic()

    try:
        with httpx.Client() as http_client:
            for i in range(0, len(locations), batch_size):
                elapsed = time.monotonic() - start_time
                remaining = total_timeout - elapsed
                if remaining <= 0:
                    raise DomainError(
                        f"terrain download timed out after {elapsed:.0f}s "
                        f"({len(all_elevations)}/{len(locations)} points)",
                        status_code=504,
                    )

                batch = locations[i : i + batch_size]
                batch_timeout = min(60.0, remaining)
                resp = http_client.post(
                    settings.open_elevation_url,
                    json={"locations": batch},
                    timeout=batch_timeout,
                )
                resp.raise_for_status()
                results = resp.json().get("results", [])

                if len(results) != len(batch):
                    missing = len(batch) - len(results)
                    logger.warning(
                        "short batch response (%d/%d) from elevation API - "
                        "filling %d missing cells with fallback_elevation=%.1f",
                        len(results),
                        len(batch),
                        missing,
                        fallback_elevation,
                    )

                for r in results:
                    raw = r.get("elevation")
                    if raw is not None:
                        try:
                            all_elevations.append(float(raw))
                        except (TypeError, ValueError):
                            all_elevations.append(fallback_elevation)
                    else:
                        all_elevations.append(fallback_elevation)

                # fill missing cells from short batch with fallback
                short_count = len(batch) - len(results)
                for _ in range(short_count):
                    all_elevations.append(fallback_elevation)
    except DomainError:
        raise
    except Exception as e:
        logger.error("open-elevation request failed: %s", e)
        raise DomainError("terrain download failed - upstream API error", status_code=502) from e

    # build geotiff raster
    height = len(lats)
    width = len(lons)
    data = np.full((height, width), -9999, dtype=np.float32)

    idx = 0
    for row in range(height):
        for col in range(width):
            if idx < len(all_elevations):
                data[row][col] = all_elevations[idx]
            idx += 1

    # flip rows - raster origin is top-left
    data = np.flipud(data)

    TERRAIN_DIR.mkdir(parents=True, exist_ok=True)
    final_path = TERRAIN_DIR / f"{airport_id}_api_cache.tif"

    transform = from_bounds(min_lon, min_lat, max_lon, max_lat, width, height)
    with rasterio.open(
        str(final_path),
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=transform,
        nodata=-9999,
    ) as dst:
        dst.write(data, 1)

    return {
        "terrain_source": "DEM_API",
        "points_downloaded": len(all_elevations),
        "bounds": [min_lon, min_lat, max_lon, max_lat],
        "resolution": [step, step],
        "file_path": str(final_path),
    }
