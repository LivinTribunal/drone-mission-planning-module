from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
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

router = APIRouter(prefix="/api/v1/airports", tags=["infrastructure"])


# ground surfaces for airport
@router.get("/{airport_id}/surfaces")
def list_surfaces(airport_id: UUID, db: Session = Depends(get_db)):
    """list all surfaces for airport"""
    surfaces = airport_service.list_surfaces(db, airport_id)
    return {"data": surfaces, "meta": {"total": len(surfaces)}}


@router.post("/{airport_id}/surfaces", status_code=201, response_model=SurfaceResponse)
def create_surface(airport_id: UUID, body: SurfaceCreate, db: Session = Depends(get_db)):
    """create surface for airport"""
    return airport_service.create_surface(db, airport_id, body.model_dump())


@router.put("/surfaces/{surface_id}", response_model=SurfaceResponse)
def update_surface(surface_id: UUID, body: SurfaceUpdate, db: Session = Depends(get_db)):
    """update surface for airport"""
    data = body.model_dump(exclude_unset=True)
    return airport_service.update_surface(db, surface_id, data)


@router.delete("/surfaces/{surface_id}", status_code=204)
def delete_surface(surface_id: UUID, db: Session = Depends(get_db)):
    """delete surface for airport"""
    airport_service.delete_surface(db, surface_id)


# obstacles for airport
@router.get("/{airport_id}/obstacles")
def list_obstacles(airport_id: UUID, db: Session = Depends(get_db)):
    """list all obstacles for airport"""
    obstacles = airport_service.list_obstacles(db, airport_id)
    return {"data": obstacles, "meta": {"total": len(obstacles)}}


@router.post("/{airport_id}/obstacles", status_code=201, response_model=ObstacleResponse)
def create_obstacle(airport_id: UUID, body: ObstacleCreate, db: Session = Depends(get_db)):
    """create obstacle for airport"""
    return airport_service.create_obstacle(db, airport_id, body.model_dump())


@router.put("/obstacles/{obstacle_id}", response_model=ObstacleResponse)
def update_obstacle(obstacle_id: UUID, body: ObstacleUpdate, db: Session = Depends(get_db)):
    """update obstacle for airport"""
    data = body.model_dump(exclude_unset=True)
    return airport_service.update_obstacle(db, obstacle_id, data)


@router.delete("/obstacles/{obstacle_id}", status_code=204)
def delete_obstacle(obstacle_id: UUID, db: Session = Depends(get_db)):
    """delete obstacle for airport"""
    airport_service.delete_obstacle(db, obstacle_id)


# safety zones for airport
@router.get("/{airport_id}/safety-zones")
def list_safety_zones(airport_id: UUID, db: Session = Depends(get_db)):
    """list all safety zones for airport"""
    zones = airport_service.list_safety_zones(db, airport_id)
    return {"data": zones, "meta": {"total": len(zones)}}


@router.post("/{airport_id}/safety-zones", status_code=201, response_model=SafetyZoneResponse)
def create_safety_zone(airport_id: UUID, body: SafetyZoneCreate, db: Session = Depends(get_db)):
    """create safety zone for airport"""
    return airport_service.create_safety_zone(db, airport_id, body.model_dump())


@router.put("/safety-zones/{zone_id}", response_model=SafetyZoneResponse)
def update_safety_zone(zone_id: UUID, body: SafetyZoneUpdate, db: Session = Depends(get_db)):
    """update safety zone for airport"""
    data = body.model_dump(exclude_unset=True)
    return airport_service.update_safety_zone(db, zone_id, data)


@router.delete("/safety-zones/{zone_id}", status_code=204)
def delete_safety_zone(zone_id: UUID, db: Session = Depends(get_db)):
    """delete safety zone for airport"""
    airport_service.delete_safety_zone(db, zone_id)


# AGLs for airport surfaces
@router.get("/surfaces/{surface_id}/agls")
def list_agls(surface_id: UUID, db: Session = Depends(get_db)):
    """list all AGLs for airport surface"""
    agls = airport_service.list_agls(db, surface_id)
    return {"data": agls, "meta": {"total": len(agls)}}


@router.post("/surfaces/{surface_id}/agls", status_code=201, response_model=AGLResponse)
def create_agl(surface_id: UUID, body: AGLCreate, db: Session = Depends(get_db)):
    """create AGL for airport surface"""
    return airport_service.create_agl(db, surface_id, body.model_dump())


@router.put("/agls/{agl_id}", response_model=AGLResponse)
def update_agl(agl_id: UUID, body: AGLUpdate, db: Session = Depends(get_db)):
    """update AGL for airport surface"""
    data = body.model_dump(exclude_unset=True)
    return airport_service.update_agl(db, agl_id, data)


@router.delete("/agls/{agl_id}", status_code=204)
def delete_agl(agl_id: UUID, db: Session = Depends(get_db)):
    """delete AGL for airport surface"""
    airport_service.delete_agl(db, agl_id)


# LHAs for airport surfaces
@router.get("/agls/{agl_id}/lhas")
def list_lhas(agl_id: UUID, db: Session = Depends(get_db)):
    """list all LHAs for airport surface"""
    lhas = airport_service.list_lhas(db, agl_id)
    return {"data": lhas, "meta": {"total": len(lhas)}}


@router.post("/agls/{agl_id}/lhas", status_code=201, response_model=LHAResponse)
def create_lha(agl_id: UUID, body: LHACreate, db: Session = Depends(get_db)):
    """create LHA for airport surface"""
    return airport_service.create_lha(db, agl_id, body.model_dump())


@router.put("/lhas/{lha_id}", response_model=LHAResponse)
def update_lha(lha_id: UUID, body: LHAUpdate, db: Session = Depends(get_db)):
    """update LHA for airport surface"""
    data = body.model_dump(exclude_unset=True)
    return airport_service.update_lha(db, lha_id, data)


@router.delete("/lhas/{lha_id}", status_code=204)
def delete_lha(lha_id: UUID, db: Session = Depends(get_db)):
    """delete LHA for airport surface"""
    airport_service.delete_lha(db, lha_id)
