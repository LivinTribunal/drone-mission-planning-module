import logging
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.config import TERRAIN_DIR
from app.core.exceptions import DomainError, NotFoundError
from app.models.agl import AGL, LHA
from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.mission import Mission
from app.models.value_objects import IcaoCode
from app.schemas.airport import AirportCreate, AirportSummaryResponse, AirportUpdate
from app.schemas.infrastructure import (
    AGLCreate,
    AGLUpdate,
    LHACreate,
    LHAUpdate,
    ObstacleCreate,
    ObstacleUpdate,
    SafetyZoneCreate,
    SafetyZoneUpdate,
    SurfaceCreate,
    SurfaceUpdate,
)
from app.services.geometry_converter import apply_schema_update, schema_to_model_data

logger = logging.getLogger(__name__)


# airports
def list_airports(db: Session) -> list[Airport]:
    """list all airports."""
    return db.query(Airport).all()


def list_airports_with_counts(db: Session) -> list[AirportSummaryResponse]:
    """list all airports with infrastructure and mission counts."""
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

    rows = (
        db.query(
            Airport,
            func.coalesce(surfaces_sub.c.surfaces_count, 0).label("surfaces_count"),
            func.coalesce(agls_sub.c.agls_count, 0).label("agls_count"),
            func.coalesce(missions_sub.c.missions_count, 0).label("missions_count"),
        )
        .outerjoin(surfaces_sub, Airport.id == surfaces_sub.c.airport_id)
        .outerjoin(agls_sub, Airport.id == agls_sub.c.airport_id)
        .outerjoin(missions_sub, Airport.id == missions_sub.c.airport_id)
        .all()
    )

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
    """create airport with ICAO code validation."""
    try:
        IcaoCode(schema.icao_code)
    except ValueError as e:
        raise DomainError(str(e))

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

    # value objects are immutable, ORM models are mutable - updates apply to ORM instances
    apply_schema_update(airport, schema)
    db.commit()
    db.refresh(airport)

    return airport


def delete_airport(db: Session, airport_id: UUID):
    """delete airport"""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    db.delete(airport)
    db.commit()


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


# obstacles
def list_obstacles(db: Session, airport_id: UUID) -> list[Obstacle]:
    """list obstacles for airport"""
    return db.query(Obstacle).filter(Obstacle.airport_id == airport_id).all()


def create_obstacle(db: Session, airport_id: UUID, schema: ObstacleCreate) -> Obstacle:
    """create obstacle via airport aggregate root."""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    data = schema_to_model_data(schema)
    obstacle = Obstacle(**data)
    airport.add_obstacle(obstacle)
    db.commit()
    db.refresh(obstacle)

    return obstacle


def update_obstacle(
    db: Session, airport_id: UUID, obstacle_id: UUID, schema: ObstacleUpdate
) -> Obstacle:
    """update obstacle, validates it belongs to airport"""
    obstacle = (
        db.query(Obstacle)
        .filter(Obstacle.id == obstacle_id, Obstacle.airport_id == airport_id)
        .first()
    )
    if not obstacle:
        raise NotFoundError("obstacle not found")

    apply_schema_update(obstacle, schema)
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

    apply_schema_update(zone, schema)
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

    data = schema_to_model_data(schema)
    agl = AGL(surface_id=surface_id, **data)
    db.add(agl)
    db.commit()
    db.refresh(agl)

    return agl


def update_agl(db: Session, surface_id: UUID, agl_id: UUID, schema: AGLUpdate) -> AGL:
    """update AGL, validates it belongs to surface"""
    agl = db.query(AGL).filter(AGL.id == agl_id, AGL.surface_id == surface_id).first()
    if not agl:
        raise NotFoundError("agl not found")

    apply_schema_update(agl, schema)
    db.commit()
    db.refresh(agl)

    return agl


def delete_agl(db: Session, surface_id: UUID, agl_id: UUID):
    """delete AGL, validates it belongs to surface"""
    agl = db.query(AGL).filter(AGL.id == agl_id, AGL.surface_id == surface_id).first()
    if not agl:
        raise NotFoundError("agl not found")

    db.delete(agl)
    db.commit()


# LHAs
def list_lhas(db: Session, surface_id: UUID, agl_id: UUID) -> list[LHA]:
    """list LHAs for AGL, validates AGL belongs to surface."""
    agl = db.query(AGL).filter(AGL.id == agl_id, AGL.surface_id == surface_id).first()
    if not agl:
        raise NotFoundError("agl not found")

    return db.query(LHA).filter(LHA.agl_id == agl_id).all()


def create_lha(db: Session, surface_id: UUID, agl_id: UUID, schema: LHACreate) -> LHA:
    """create LHA for AGL, validates AGL belongs to surface."""
    agl = db.query(AGL).filter(AGL.id == agl_id, AGL.surface_id == surface_id).first()
    if not agl:
        raise NotFoundError("agl not found")

    data = schema_to_model_data(schema)
    lha = LHA(agl_id=agl_id, **data)
    db.add(lha)
    db.commit()
    db.refresh(lha)

    return lha


def update_lha(db: Session, agl_id: UUID, lha_id: UUID, schema: LHAUpdate) -> LHA:
    """update LHA, validates it belongs to AGL"""
    lha = db.query(LHA).filter(LHA.id == lha_id, LHA.agl_id == agl_id).first()
    if not lha:
        raise NotFoundError("lha not found")

    apply_schema_update(lha, schema)
    db.commit()
    db.refresh(lha)

    return lha


def delete_lha(db: Session, agl_id: UUID, lha_id: UUID):
    """delete LHA, validates it belongs to AGL"""
    lha = db.query(LHA).filter(LHA.id == lha_id, LHA.agl_id == agl_id).first()
    if not lha:
        raise NotFoundError("lha not found")

    db.delete(lha)
    db.commit()


# terrain
def upload_terrain_dem(
    db: Session,
    airport_id: UUID,
    file_path: str,
    coverage_bounds: list[float],
    coverage_resolution: list[float],
    terrain_source: str = "DEM_UPLOAD",
) -> Airport:
    """set airport terrain source after file upload or API download."""
    import os

    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise NotFoundError("airport not found")

    # clean up old DEM file if switching to a different path
    old_path = airport.dem_file_path
    if old_path and old_path != file_path and os.path.exists(old_path):
        os.unlink(old_path)

    airport.terrain_source = terrain_source
    airport.dem_file_path = file_path
    db.commit()
    db.refresh(airport)

    return airport


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
        from app.schemas.geometry import parse_ewkb

        parsed = parse_ewkb(loc.data)
        coords = parsed.get("coordinates", [])
        if len(coords) < 2:
            raise DomainError("airport location is missing coordinates", status_code=400)
        return coords[0], coords[1]

    coords = loc.get("coordinates", [])
    if len(coords) < 2:
        raise DomainError("airport location is missing coordinates", status_code=400)
    return coords[0], coords[1]


def download_terrain_from_api(db: Session, airport_id: UUID) -> dict:
    """download elevation data from open-elevation API and cache as geotiff."""
    import time

    try:
        import numpy as np
        import rasterio
        from rasterio.transform import from_bounds
    except ImportError as e:
        raise DomainError(
            "rasterio/numpy not installed - terrain download not available",
            status_code=501,
        ) from e

    import httpx

    from app.core.config import settings

    # fetch airport data then release from session before long HTTP calls
    airport = get_airport(db, airport_id)
    apt_lon, apt_lat = get_airport_lonlat(airport)
    db.expunge(airport)

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
                    logger.warning(
                        "short batch response (%d/%d) from elevation API",
                        len(results),
                        len(batch),
                    )

                for r in results:
                    raw = r.get("elevation")
                    if raw is not None:
                        try:
                            all_elevations.append(float(raw))
                        except (TypeError, ValueError):
                            all_elevations.append(airport.elevation)
                    else:
                        all_elevations.append(airport.elevation)
    except DomainError:
        raise
    except Exception as e:
        raise DomainError(f"Open-Elevation API request failed: {e}", status_code=502) from e

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

    try:
        upload_terrain_dem(
            db,
            airport_id,
            str(final_path),
            [min_lon, min_lat, max_lon, max_lat],
            [step, step],
            terrain_source="DEM_API",
        )
    except Exception:
        if final_path.exists():
            final_path.unlink()
        raise

    return {
        "terrain_source": "DEM_API",
        "points_downloaded": len(all_elevations),
        "bounds": [min_lon, min_lat, max_lon, max_lat],
        "resolution": [step, step],
    }
