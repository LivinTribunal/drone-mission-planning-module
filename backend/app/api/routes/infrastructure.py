from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
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
from app.services import airport_service

router = APIRouter(prefix="/api/v1/airports", tags=["infrastructure"])


# surfaces


@router.get("/{airport_id}/surfaces")
def list_surfaces(airport_id: UUID, db: Session = Depends(get_db)):
    surfaces = airport_service.list_surfaces(db, airport_id)
    return {"data": surfaces, "meta": {"total": len(surfaces)}}


@router.post("/{airport_id}/surfaces", status_code=201)
def create_surface(airport_id: UUID, body: SurfaceCreate, db: Session = Depends(get_db)):
    return airport_service.create_surface(db, airport_id, body.model_dump())


@router.put("/surfaces/{surface_id}")
def update_surface(surface_id: UUID, body: SurfaceUpdate, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    return airport_service.update_surface(db, surface_id, data)


@router.delete("/surfaces/{surface_id}", status_code=204)
def delete_surface(surface_id: UUID, db: Session = Depends(get_db)):
    airport_service.delete_surface(db, surface_id)


# obstacles


@router.get("/{airport_id}/obstacles")
def list_obstacles(airport_id: UUID, db: Session = Depends(get_db)):
    obstacles = airport_service.list_obstacles(db, airport_id)
    return {"data": obstacles, "meta": {"total": len(obstacles)}}


@router.post("/{airport_id}/obstacles", status_code=201)
def create_obstacle(airport_id: UUID, body: ObstacleCreate, db: Session = Depends(get_db)):
    return airport_service.create_obstacle(db, airport_id, body.model_dump())


@router.put("/obstacles/{obstacle_id}")
def update_obstacle(obstacle_id: UUID, body: ObstacleUpdate, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    return airport_service.update_obstacle(db, obstacle_id, data)


@router.delete("/obstacles/{obstacle_id}", status_code=204)
def delete_obstacle(obstacle_id: UUID, db: Session = Depends(get_db)):
    airport_service.delete_obstacle(db, obstacle_id)


# safety zones


@router.get("/{airport_id}/safety-zones")
def list_safety_zones(airport_id: UUID, db: Session = Depends(get_db)):
    zones = airport_service.list_safety_zones(db, airport_id)
    return {"data": zones, "meta": {"total": len(zones)}}


@router.post("/{airport_id}/safety-zones", status_code=201)
def create_safety_zone(airport_id: UUID, body: SafetyZoneCreate, db: Session = Depends(get_db)):
    return airport_service.create_safety_zone(db, airport_id, body.model_dump())


@router.put("/safety-zones/{zone_id}")
def update_safety_zone(zone_id: UUID, body: SafetyZoneUpdate, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    return airport_service.update_safety_zone(db, zone_id, data)


@router.delete("/safety-zones/{zone_id}", status_code=204)
def delete_safety_zone(zone_id: UUID, db: Session = Depends(get_db)):
    airport_service.delete_safety_zone(db, zone_id)


# AGLs


@router.get("/surfaces/{surface_id}/agls")
def list_agls(surface_id: UUID, db: Session = Depends(get_db)):
    agls = airport_service.list_agls(db, surface_id)
    return {"data": agls, "meta": {"total": len(agls)}}


@router.post("/surfaces/{surface_id}/agls", status_code=201)
def create_agl(surface_id: UUID, body: AGLCreate, db: Session = Depends(get_db)):
    return airport_service.create_agl(db, surface_id, body.model_dump())


@router.put("/agls/{agl_id}")
def update_agl(agl_id: UUID, body: AGLUpdate, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    return airport_service.update_agl(db, agl_id, data)


@router.delete("/agls/{agl_id}", status_code=204)
def delete_agl(agl_id: UUID, db: Session = Depends(get_db)):
    airport_service.delete_agl(db, agl_id)


# LHAs


@router.get("/agls/{agl_id}/lhas")
def list_lhas(agl_id: UUID, db: Session = Depends(get_db)):
    lhas = airport_service.list_lhas(db, agl_id)
    return {"data": lhas, "meta": {"total": len(lhas)}}


@router.post("/agls/{agl_id}/lhas", status_code=201)
def create_lha(agl_id: UUID, body: LHACreate, db: Session = Depends(get_db)):
    return airport_service.create_lha(db, agl_id, body.model_dump())


@router.put("/lhas/{lha_id}")
def update_lha(lha_id: UUID, body: LHAUpdate, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    return airport_service.update_lha(db, lha_id, data)


@router.delete("/lhas/{lha_id}", status_code=204)
def delete_lha(lha_id: UUID, db: Session = Depends(get_db)):
    airport_service.delete_lha(db, lha_id)
