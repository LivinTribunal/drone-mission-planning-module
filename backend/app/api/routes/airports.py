import logging
import os
import shutil
import tempfile
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import TERRAIN_DIR
from app.core.dependencies import get_db
from app.schemas.airport import (
    AirportCreate,
    AirportDetailResponse,
    AirportListResponse,
    AirportResponse,
    AirportSummaryListResponse,
    AirportUpdate,
    TerrainCoverage,
    TerrainDownloadResponse,
    TerrainUploadResponse,
)
from app.schemas.common import DeleteResponse, ListMeta
from app.schemas.infrastructure import (
    AGLCreate,
    AGLListResponse,
    AGLResponse,
    AGLUpdate,
    LHACreate,
    LHAListResponse,
    LHAResponse,
    LHAUpdate,
    ObstacleCreate,
    ObstacleListResponse,
    ObstacleResponse,
    ObstacleUpdate,
    SafetyZoneCreate,
    SafetyZoneListResponse,
    SafetyZoneResponse,
    SafetyZoneUpdate,
    SurfaceCreate,
    SurfaceListResponse,
    SurfaceResponse,
    SurfaceUpdate,
)
from app.services import airport_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/airports", tags=["airports"])


# airports
@router.get("", response_model=AirportListResponse)
def list_airports(db: Session = Depends(get_db)):
    """list all available airports for user."""
    airports = airport_service.list_airports(db)

    return AirportListResponse(data=airports, meta=ListMeta(total=len(airports)))


@router.get("/summary", response_model=AirportSummaryListResponse)
def list_airports_summary(db: Session = Depends(get_db)):
    """list all airports with infrastructure and mission counts."""
    summaries = airport_service.list_airports_with_counts(db)

    return AirportSummaryListResponse(data=summaries, meta=ListMeta(total=len(summaries)))


@router.get("/{airport_id}", response_model=AirportDetailResponse)
def get_airport(airport_id: UUID, db: Session = Depends(get_db)):
    """get airport by id"""
    return airport_service.get_airport(db, airport_id)


@router.post("", status_code=201, response_model=AirportResponse)
def create_airport(body: AirportCreate, db: Session = Depends(get_db)):
    """create airport"""
    return airport_service.create_airport(db, body)


@router.put("/{airport_id}", response_model=AirportResponse)
def update_airport(airport_id: UUID, body: AirportUpdate, db: Session = Depends(get_db)):
    """update airport"""
    return airport_service.update_airport(db, airport_id, body)


@router.delete("/{airport_id}", response_model=DeleteResponse)
def delete_airport(airport_id: UUID, db: Session = Depends(get_db)):
    """delete airport"""
    airport_service.delete_airport(db, airport_id)

    return DeleteResponse(deleted=True)


# terrain DEM
MAX_DEM_SIZE = 500 * 1024 * 1024  # 500MB


@router.post("/{airport_id}/terrain-dem", response_model=TerrainUploadResponse)
async def upload_terrain_dem(airport_id: UUID, file: UploadFile, db: Session = Depends(get_db)):
    """upload a GeoTIFF DEM file for terrain-following altitude."""
    try:
        import rasterio
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="rasterio not installed - DEM upload not available",
        )

    # validate file extension
    if not file.filename or not file.filename.lower().endswith((".tif", ".tiff")):
        raise HTTPException(status_code=400, detail="file must be a GeoTIFF (.tif/.tiff)")

    # save to temp file first for validation
    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
        tmp_path = tmp.name
        size = 0
        while chunk := await file.read(8192):
            size += len(chunk)
            if size > MAX_DEM_SIZE:
                os.unlink(tmp_path)
                raise HTTPException(status_code=400, detail="file exceeds 500MB limit")
            tmp.write(chunk)

    try:
        # validate with rasterio
        with rasterio.open(tmp_path) as dataset:
            bounds = list(dataset.bounds)
            res_x = abs(dataset.transform.a)
            res_y = abs(dataset.transform.e)

            # validate coverage of airport location
            airport = airport_service.get_airport(db, airport_id)
            loc = airport.location
            if hasattr(loc, "data"):
                from app.schemas.geometry import parse_ewkb

                parsed = parse_ewkb(loc.data)
                coords = parsed.get("coordinates", [])
                apt_lon, apt_lat = coords[0], coords[1]
            else:
                apt_lon = loc.get("coordinates", [0, 0])[0]
                apt_lat = loc.get("coordinates", [0, 0])[1]

            # check if airport point is within DEM bounds
            if not (bounds[0] <= apt_lon <= bounds[2] and bounds[1] <= apt_lat <= bounds[3]):
                os.unlink(tmp_path)
                raise HTTPException(status_code=400, detail="DEM does not cover airport location")

        # move to final location
        TERRAIN_DIR.mkdir(parents=True, exist_ok=True)
        final_path = TERRAIN_DIR / f"{airport_id}.tif"
        shutil.move(tmp_path, str(final_path))

        airport_service.upload_terrain_dem(db, airport_id, str(final_path), bounds, [res_x, res_y])

        return TerrainUploadResponse(
            terrain_source="DEM",
            coverage=TerrainCoverage(bounds=bounds, resolution=[res_x, res_y]),
        )

    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        logger.exception("DEM upload failed")
        raise HTTPException(status_code=400, detail=f"invalid GeoTIFF file: {e}")


@router.delete("/{airport_id}/terrain-dem", response_model=DeleteResponse)
def delete_terrain_dem(airport_id: UUID, db: Session = Depends(get_db)):
    """remove DEM file and revert airport to flat terrain."""
    airport = airport_service.get_airport(db, airport_id)
    old_dem_path = airport.dem_file_path

    # db first - only delete file after commit succeeds
    airport_service.delete_terrain_dem(db, airport_id)

    if old_dem_path and os.path.exists(old_dem_path):
        os.unlink(old_dem_path)

    return DeleteResponse(deleted=True)


@router.post("/{airport_id}/terrain-download", response_model=TerrainDownloadResponse)
def download_terrain_data(airport_id: UUID, db: Session = Depends(get_db)):
    """download elevation data from Open-Elevation API and cache as GeoTIFF."""
    from app.core.exceptions import DomainError

    try:
        result = airport_service.download_terrain_from_api(db, airport_id)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    return TerrainDownloadResponse(
        terrain_source=result["terrain_source"],
        points_downloaded=result["points_downloaded"],
        coverage=TerrainCoverage(
            bounds=result["bounds"],
            resolution=result["resolution"],
        ),
    )


# ground surfaces
@router.get("/{airport_id}/surfaces", response_model=SurfaceListResponse)
def list_surfaces(airport_id: UUID, db: Session = Depends(get_db)):
    """list all surfaces for airport"""
    surfaces = airport_service.list_surfaces(db, airport_id)

    return SurfaceListResponse(data=surfaces, meta=ListMeta(total=len(surfaces)))


@router.post("/{airport_id}/surfaces", status_code=201, response_model=SurfaceResponse)
def create_surface(airport_id: UUID, body: SurfaceCreate, db: Session = Depends(get_db)):
    """create surface for airport"""
    return airport_service.create_surface(db, airport_id, body)


@router.put("/{airport_id}/surfaces/{surface_id}", response_model=SurfaceResponse)
def update_surface(
    airport_id: UUID, surface_id: UUID, body: SurfaceUpdate, db: Session = Depends(get_db)
):
    """update surface for airport"""
    return airport_service.update_surface(db, airport_id, surface_id, body)


@router.delete("/{airport_id}/surfaces/{surface_id}", response_model=DeleteResponse)
def delete_surface(airport_id: UUID, surface_id: UUID, db: Session = Depends(get_db)):
    """delete surface for airport"""
    airport_service.delete_surface(db, airport_id, surface_id)

    return DeleteResponse(deleted=True)


# obstacles
@router.get("/{airport_id}/obstacles", response_model=ObstacleListResponse)
def list_obstacles(airport_id: UUID, db: Session = Depends(get_db)):
    """list all obstacles for airport"""
    obstacles = airport_service.list_obstacles(db, airport_id)

    return ObstacleListResponse(data=obstacles, meta=ListMeta(total=len(obstacles)))


@router.post("/{airport_id}/obstacles", status_code=201, response_model=ObstacleResponse)
def create_obstacle(airport_id: UUID, body: ObstacleCreate, db: Session = Depends(get_db)):
    """create obstacle for airport"""
    return airport_service.create_obstacle(db, airport_id, body)


@router.put("/{airport_id}/obstacles/{obstacle_id}", response_model=ObstacleResponse)
def update_obstacle(
    airport_id: UUID, obstacle_id: UUID, body: ObstacleUpdate, db: Session = Depends(get_db)
):
    """update obstacle"""
    return airport_service.update_obstacle(db, airport_id, obstacle_id, body)


@router.delete("/{airport_id}/obstacles/{obstacle_id}", response_model=DeleteResponse)
def delete_obstacle(airport_id: UUID, obstacle_id: UUID, db: Session = Depends(get_db)):
    """delete obstacle"""
    airport_service.delete_obstacle(db, airport_id, obstacle_id)

    return DeleteResponse(deleted=True)


# safety zones
@router.get("/{airport_id}/safety-zones", response_model=SafetyZoneListResponse)
def list_safety_zones(airport_id: UUID, db: Session = Depends(get_db)):
    """list all safety zones for airport"""
    zones = airport_service.list_safety_zones(db, airport_id)

    return SafetyZoneListResponse(data=zones, meta=ListMeta(total=len(zones)))


@router.post("/{airport_id}/safety-zones", status_code=201, response_model=SafetyZoneResponse)
def create_safety_zone(airport_id: UUID, body: SafetyZoneCreate, db: Session = Depends(get_db)):
    """create safety zone for airport"""
    return airport_service.create_safety_zone(db, airport_id, body)


@router.put("/{airport_id}/safety-zones/{zone_id}", response_model=SafetyZoneResponse)
def update_safety_zone(
    airport_id: UUID, zone_id: UUID, body: SafetyZoneUpdate, db: Session = Depends(get_db)
):
    """update safety zone"""
    return airport_service.update_safety_zone(db, airport_id, zone_id, body)


@router.delete("/{airport_id}/safety-zones/{zone_id}", response_model=DeleteResponse)
def delete_safety_zone(airport_id: UUID, zone_id: UUID, db: Session = Depends(get_db)):
    """delete safety zone"""
    airport_service.delete_safety_zone(db, airport_id, zone_id)

    return DeleteResponse(deleted=True)


# AGLs
@router.get("/{airport_id}/surfaces/{surface_id}/agls", response_model=AGLListResponse)
def list_agls(airport_id: UUID, surface_id: UUID, db: Session = Depends(get_db)):
    """list all AGLs for surface"""
    agls = airport_service.list_agls(db, airport_id, surface_id)

    return AGLListResponse(data=agls, meta=ListMeta(total=len(agls)))


@router.post(
    "/{airport_id}/surfaces/{surface_id}/agls", status_code=201, response_model=AGLResponse
)
def create_agl(airport_id: UUID, surface_id: UUID, body: AGLCreate, db: Session = Depends(get_db)):
    """create AGL for surface"""
    return airport_service.create_agl(db, airport_id, surface_id, body)


@router.put("/{airport_id}/surfaces/{surface_id}/agls/{agl_id}", response_model=AGLResponse)
def update_agl(
    airport_id: UUID,
    surface_id: UUID,
    agl_id: UUID,
    body: AGLUpdate,
    db: Session = Depends(get_db),
):
    """update AGL"""
    return airport_service.update_agl(db, surface_id, agl_id, body)


@router.delete("/{airport_id}/surfaces/{surface_id}/agls/{agl_id}", response_model=DeleteResponse)
def delete_agl(airport_id: UUID, surface_id: UUID, agl_id: UUID, db: Session = Depends(get_db)):
    """delete AGL"""
    airport_service.delete_agl(db, surface_id, agl_id)

    return DeleteResponse(deleted=True)


# LHAs
@router.get(
    "/{airport_id}/surfaces/{surface_id}/agls/{agl_id}/lhas", response_model=LHAListResponse
)
def list_lhas(airport_id: UUID, surface_id: UUID, agl_id: UUID, db: Session = Depends(get_db)):
    """list all LHAs for AGL"""
    lhas = airport_service.list_lhas(db, surface_id, agl_id)

    return LHAListResponse(data=lhas, meta=ListMeta(total=len(lhas)))


@router.post(
    "/{airport_id}/surfaces/{surface_id}/agls/{agl_id}/lhas",
    status_code=201,
    response_model=LHAResponse,
)
def create_lha(
    airport_id: UUID,
    surface_id: UUID,
    agl_id: UUID,
    body: LHACreate,
    db: Session = Depends(get_db),
):
    """create LHA for AGL"""
    return airport_service.create_lha(db, surface_id, agl_id, body)


@router.put(
    "/{airport_id}/surfaces/{surface_id}/agls/{agl_id}/lhas/{lha_id}",
    response_model=LHAResponse,
)
def update_lha(
    airport_id: UUID,
    surface_id: UUID,
    agl_id: UUID,
    lha_id: UUID,
    body: LHAUpdate,
    db: Session = Depends(get_db),
):
    """update LHA"""
    return airport_service.update_lha(db, agl_id, lha_id, body)


@router.delete(
    "/{airport_id}/surfaces/{surface_id}/agls/{agl_id}/lhas/{lha_id}",
    response_model=DeleteResponse,
)
def delete_lha(
    airport_id: UUID,
    surface_id: UUID,
    agl_id: UUID,
    lha_id: UUID,
    db: Session = Depends(get_db),
):
    """delete LHA"""
    airport_service.delete_lha(db, agl_id, lha_id)

    return DeleteResponse(deleted=True)
