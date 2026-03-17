from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.agl import AGL, LHA
from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.value_objects import IcaoCode
from app.schemas.airport import AirportCreate, AirportUpdate
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


# airports
def list_airports(db: Session) -> list[Airport]:
    """list all airports"""
    return db.query(Airport).all()


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
        raise HTTPException(status_code=404, detail="airport not found")

    return airport


def create_airport(db: Session, schema: AirportCreate) -> Airport:
    """create airport with ICAO code validation."""
    try:
        IcaoCode(schema.icao_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    airport = Airport(**schema_to_model_data(schema))
    db.add(airport)
    db.commit()
    db.refresh(airport)

    return airport


def update_airport(db: Session, airport_id: UUID, schema: AirportUpdate) -> Airport:
    """update airport"""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise HTTPException(status_code=404, detail="airport not found")

    apply_schema_update(airport, schema)
    db.commit()
    db.refresh(airport)

    return airport


def delete_airport(db: Session, airport_id: UUID):
    """delete airport"""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise HTTPException(status_code=404, detail="airport not found")

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
        raise HTTPException(status_code=404, detail="airport not found")

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
        raise HTTPException(status_code=404, detail="surface not found")

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
        raise HTTPException(status_code=404, detail="surface not found")

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
        raise HTTPException(status_code=404, detail="airport not found")

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
        raise HTTPException(status_code=404, detail="obstacle not found")

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
        raise HTTPException(status_code=404, detail="obstacle not found")

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
        raise HTTPException(status_code=404, detail="airport not found")

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
        raise HTTPException(status_code=404, detail="safety zone not found")

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
        raise HTTPException(status_code=404, detail="safety zone not found")

    db.delete(zone)
    db.commit()


# AGLs
def list_agls(db: Session, surface_id: UUID) -> list[AGL]:
    """list AGLs for surface"""
    return db.query(AGL).options(joinedload(AGL.lhas)).filter(AGL.surface_id == surface_id).all()


def create_agl(db: Session, surface_id: UUID, schema: AGLCreate) -> AGL:
    """create AGL for surface"""
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
        raise HTTPException(status_code=404, detail="agl not found")

    apply_schema_update(agl, schema)
    db.commit()
    db.refresh(agl)

    return agl


def delete_agl(db: Session, surface_id: UUID, agl_id: UUID):
    """delete AGL, validates it belongs to surface"""
    agl = db.query(AGL).filter(AGL.id == agl_id, AGL.surface_id == surface_id).first()
    if not agl:
        raise HTTPException(status_code=404, detail="agl not found")

    db.delete(agl)
    db.commit()


# LHAs
def list_lhas(db: Session, agl_id: UUID) -> list[LHA]:
    """list LHAs for AGL"""
    return db.query(LHA).filter(LHA.agl_id == agl_id).all()


def create_lha(db: Session, agl_id: UUID, schema: LHACreate) -> LHA:
    """create LHA for AGL"""
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
        raise HTTPException(status_code=404, detail="lha not found")

    apply_schema_update(lha, schema)
    db.commit()
    db.refresh(lha)

    return lha


def delete_lha(db: Session, agl_id: UUID, lha_id: UUID):
    """delete LHA, validates it belongs to AGL"""
    lha = db.query(LHA).filter(LHA.id == lha_id, LHA.agl_id == agl_id).first()
    if not lha:
        raise HTTPException(status_code=404, detail="lha not found")

    db.delete(lha)
    db.commit()
