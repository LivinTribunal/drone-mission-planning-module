from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.schemas.airport import (
    AirportCreate,
    AirportDetailResponse,
    AirportListResponse,
    AirportResponse,
    AirportUpdate,
)
from app.schemas.infrastructure import (
    AGLCreate,
    AGLResponse,
    AGLUpdate,
    LHACreate,
    LHAResponse,
    LHAUpdate,
    ObstacleCreate,
    ObstacleResponse,
    ObstacleUpdate,
    SafetyZoneCreate,
    SafetyZoneResponse,
    SafetyZoneUpdate,
    SurfaceCreate,
    SurfaceResponse,
    SurfaceUpdate,
)
from app.services import airport_service

router = APIRouter(prefix="/api/v1/airports", tags=["airports"])


# airports


@router.get("", response_model=AirportListResponse)
def list_airports(db: Session = Depends(get_db)):
    """list all avaible airports for user"""
    airports = airport_service.list_airports(db)

    return {"data": airports, "meta": {"total": len(airports)}}


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


@router.delete("/{airport_id}", status_code=204)
def delete_airport(airport_id: UUID, db: Session = Depends(get_db)):
    """delete airport"""
    airport_service.delete_airport(db, airport_id)


# ground surfaces


@router.get("/{airport_id}/surfaces")
def list_surfaces(airport_id: UUID, db: Session = Depends(get_db)):
    """list all surfaces for airport"""
    surfaces = airport_service.list_surfaces(db, airport_id)
    data = [SurfaceResponse.model_validate(s).model_dump() for s in surfaces]

    return {"data": data, "meta": {"total": len(data)}}


@router.post("/{airport_id}/surfaces", status_code=201, response_model=SurfaceResponse)
def create_surface(airport_id: UUID, body: SurfaceCreate, db: Session = Depends(get_db)):
    """create surface for airport"""
    return airport_service.create_surface(db, airport_id, body)


@router.put("/surfaces/{surface_id}", response_model=SurfaceResponse)
def update_surface(surface_id: UUID, body: SurfaceUpdate, db: Session = Depends(get_db)):
    """update surface"""
    return airport_service.update_surface(db, surface_id, body)


@router.delete("/surfaces/{surface_id}", status_code=204)
def delete_surface(surface_id: UUID, db: Session = Depends(get_db)):
    """delete surface"""
    airport_service.delete_surface(db, surface_id)


# obstacles


@router.get("/{airport_id}/obstacles")
def list_obstacles(airport_id: UUID, db: Session = Depends(get_db)):
    """list all obstacles for airport"""
    obstacles = airport_service.list_obstacles(db, airport_id)
    data = [ObstacleResponse.model_validate(o).model_dump() for o in obstacles]

    return {"data": data, "meta": {"total": len(data)}}


@router.post("/{airport_id}/obstacles", status_code=201, response_model=ObstacleResponse)
def create_obstacle(airport_id: UUID, body: ObstacleCreate, db: Session = Depends(get_db)):
    """create obstacle for airport"""
    return airport_service.create_obstacle(db, airport_id, body)


@router.put("/obstacles/{obstacle_id}", response_model=ObstacleResponse)
def update_obstacle(obstacle_id: UUID, body: ObstacleUpdate, db: Session = Depends(get_db)):
    """update obstacle"""
    return airport_service.update_obstacle(db, obstacle_id, body)


@router.delete("/obstacles/{obstacle_id}", status_code=204)
def delete_obstacle(obstacle_id: UUID, db: Session = Depends(get_db)):
    """delete obstacle"""
    airport_service.delete_obstacle(db, obstacle_id)


# safety zones


@router.get("/{airport_id}/safety-zones")
def list_safety_zones(airport_id: UUID, db: Session = Depends(get_db)):
    """list all safety zones for airport"""
    zones = airport_service.list_safety_zones(db, airport_id)
    data = [SafetyZoneResponse.model_validate(z).model_dump() for z in zones]

    return {"data": data, "meta": {"total": len(data)}}


@router.post("/{airport_id}/safety-zones", status_code=201, response_model=SafetyZoneResponse)
def create_safety_zone(airport_id: UUID, body: SafetyZoneCreate, db: Session = Depends(get_db)):
    """create safety zone for airport"""
    return airport_service.create_safety_zone(db, airport_id, body)


@router.put("/safety-zones/{zone_id}", response_model=SafetyZoneResponse)
def update_safety_zone(zone_id: UUID, body: SafetyZoneUpdate, db: Session = Depends(get_db)):
    """update safety zone"""
    return airport_service.update_safety_zone(db, zone_id, body)


@router.delete("/safety-zones/{zone_id}", status_code=204)
def delete_safety_zone(zone_id: UUID, db: Session = Depends(get_db)):
    """delete safety zone"""
    airport_service.delete_safety_zone(db, zone_id)


# AGLs


@router.get("/surfaces/{surface_id}/agls")
def list_agls(surface_id: UUID, db: Session = Depends(get_db)):
    """list all AGLs for surface"""
    agls = airport_service.list_agls(db, surface_id)
    data = [AGLResponse.model_validate(a).model_dump() for a in agls]

    return {"data": data, "meta": {"total": len(data)}}


@router.post("/surfaces/{surface_id}/agls", status_code=201, response_model=AGLResponse)
def create_agl(surface_id: UUID, body: AGLCreate, db: Session = Depends(get_db)):
    """create AGL for surface"""
    return airport_service.create_agl(db, surface_id, body)


@router.put("/agls/{agl_id}", response_model=AGLResponse)
def update_agl(agl_id: UUID, body: AGLUpdate, db: Session = Depends(get_db)):
    """update AGL"""
    return airport_service.update_agl(db, agl_id, body)


@router.delete("/agls/{agl_id}", status_code=204)
def delete_agl(agl_id: UUID, db: Session = Depends(get_db)):
    """delete AGL"""
    airport_service.delete_agl(db, agl_id)


# LHAs


@router.get("/agls/{agl_id}/lhas")
def list_lhas(agl_id: UUID, db: Session = Depends(get_db)):
    """list all LHAs for AGL"""
    lhas = airport_service.list_lhas(db, agl_id)
    data = [LHAResponse.model_validate(lha).model_dump() for lha in lhas]

    return {"data": data, "meta": {"total": len(data)}}


@router.post("/agls/{agl_id}/lhas", status_code=201, response_model=LHAResponse)
def create_lha(agl_id: UUID, body: LHACreate, db: Session = Depends(get_db)):
    """create LHA for AGL"""
    return airport_service.create_lha(db, agl_id, body)


@router.put("/lhas/{lha_id}", response_model=LHAResponse)
def update_lha(lha_id: UUID, body: LHAUpdate, db: Session = Depends(get_db)):
    """update LHA"""
    return airport_service.update_lha(db, lha_id, body)


@router.delete("/lhas/{lha_id}", status_code=204)
def delete_lha(lha_id: UUID, db: Session = Depends(get_db)):
    """delete LHA"""
    airport_service.delete_lha(db, lha_id)
