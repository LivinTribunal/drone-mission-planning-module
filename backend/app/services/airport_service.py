from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.agl import AGL, LHA
from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.services.geo import geojson_to_ewkt, wkb_to_geojson

# geometry fields per model
AIRPORT_GEOM = ["location"]
SURFACE_GEOM = ["geometry", "threshold_position", "end_position"]
OBSTACLE_GEOM = ["position", "geometry"]
ZONE_GEOM = ["geometry"]
AGL_GEOM = ["position"]
LHA_GEOM = ["position"]


# helper functions
# TODO: why don't we use models for data in all services?
def _set_fields(obj, data: dict, geom_fields: list[str]):
    """set fields of an object"""
    for key, val in data.items():
        if key in geom_fields and val is not None:
            setattr(obj, key, geojson_to_ewkt(val))
        else:
            setattr(obj, key, val)


def _to_dict(obj, geom_fields: list[str], db: Session) -> dict:
    """convert an object to a dictionary"""
    result = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.name)
        if col.name in geom_fields:
            result[col.name] = wkb_to_geojson(val, db)
        else:
            result[col.name] = val

    return result


def _airport_dict(airport: Airport, db: Session) -> dict:
    """convert an airport to a dictionary"""
    return _to_dict(airport, AIRPORT_GEOM, db)


def _surface_dict(surface: AirfieldSurface, db: Session) -> dict:
    """convert a surface to a dictionary"""
    d = _to_dict(surface, SURFACE_GEOM, db)
    d["agls"] = [_agl_dict(a, db) for a in surface.agls]

    return d


def _agl_dict(agl: AGL, db: Session) -> dict:
    """convert an AGL to a dictionary"""
    d = _to_dict(agl, AGL_GEOM, db)
    d["lhas"] = [_to_dict(lha, LHA_GEOM, db) for lha in agl.lhas]

    return d


def _detail_dict(airport: Airport, db: Session) -> dict:
    """convert an airport to a dictionary with all its details"""
    d = _airport_dict(airport, db)
    d["surfaces"] = [_surface_dict(surface, db) for surface in airport.surfaces]
    d["obstacles"] = [_to_dict(obstacle, OBSTACLE_GEOM, db) for obstacle in airport.obstacles]
    d["safety_zones"] = [_to_dict(zone, ZONE_GEOM, db) for zone in airport.safety_zones]

    return d


# airports
def list_airports(db: Session) -> list[dict]:
    """list all airports"""
    airports = db.query(Airport).all()

    return [_airport_dict(airport, db) for airport in airports]


def get_airport(db: Session, airport_id: UUID) -> dict:
    """get an airport by id"""
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

    return _detail_dict(airport, db)


def create_airport(db: Session, data: dict) -> dict:
    """create an airport"""
    airport = Airport()
    _set_fields(airport, data, AIRPORT_GEOM)
    db.add(airport)
    db.commit()
    db.refresh(airport)

    return _airport_dict(airport, db)


def update_airport(db: Session, airport_id: UUID, data: dict) -> dict:
    """update an airport"""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise HTTPException(status_code=404, detail="airport not found")

    _set_fields(airport, data, AIRPORT_GEOM)
    db.commit()
    db.refresh(airport)

    return _airport_dict(airport, db)


def delete_airport(db: Session, airport_id: UUID):
    """delete an airport"""
    airport = db.query(Airport).filter(Airport.id == airport_id).first()

    if not airport:
        raise HTTPException(status_code=404, detail="airport not found")

    db.delete(airport)
    db.commit()


# surfaces for airport
def list_surfaces(db: Session, airport_id: UUID) -> list[dict]:
    """list all surfaces for an airport"""
    surfaces = (
        db.query(AirfieldSurface)
        .options(joinedload(AirfieldSurface.agls).joinedload(AGL.lhas))
        .filter(AirfieldSurface.airport_id == airport_id)
        .all()
    )

    return [_surface_dict(surface, db) for surface in surfaces]


def create_surface(db: Session, airport_id: UUID, data: dict) -> dict:
    """create a surface"""
    surface = AirfieldSurface(airport_id=airport_id)
    _set_fields(surface, data, SURFACE_GEOM)
    db.add(surface)
    db.commit()
    db.refresh(surface)

    return _surface_dict(surface, db)


def update_surface(db: Session, surface_id: UUID, data: dict) -> dict:
    """update a surface"""
    surface = db.query(AirfieldSurface).filter(AirfieldSurface.id == surface_id).first()
    if not surface:
        raise HTTPException(status_code=404, detail="surface not found")

    _set_fields(surface, data, SURFACE_GEOM)
    db.commit()
    db.refresh(surface)

    return _surface_dict(surface, db)


def delete_surface(db: Session, surface_id: UUID):
    """delete a surface"""
    surface = db.query(AirfieldSurface).filter(AirfieldSurface.id == surface_id).first()
    if not surface:
        raise HTTPException(status_code=404, detail="surface not found")

    db.delete(surface)
    db.commit()


# obstacles for airport
def list_obstacles(db: Session, airport_id: UUID) -> list[dict]:
    """list all obstacles for an airport"""
    obstacles = db.query(Obstacle).filter(Obstacle.airport_id == airport_id).all()

    return [_to_dict(obstacle, OBSTACLE_GEOM, db) for obstacle in obstacles]


def create_obstacle(db: Session, airport_id: UUID, data: dict) -> dict:
    """create an obstacle"""
    obstacle = Obstacle(airport_id=airport_id)
    _set_fields(obstacle, data, OBSTACLE_GEOM)
    db.add(obstacle)
    db.commit()
    db.refresh(obstacle)

    return _to_dict(obstacle, OBSTACLE_GEOM, db)


def update_obstacle(db: Session, obstacle_id: UUID, data: dict) -> dict:
    """update an obstacle"""
    obstacle = db.query(Obstacle).filter(Obstacle.id == obstacle_id).first()
    if not obstacle:
        raise HTTPException(status_code=404, detail="obstacle not found")

    _set_fields(obstacle, data, OBSTACLE_GEOM)
    db.commit()
    db.refresh(obstacle)

    return _to_dict(obstacle, OBSTACLE_GEOM, db)


def delete_obstacle(db: Session, obstacle_id: UUID):
    """delete an obstacle"""
    obstacle = db.query(Obstacle).filter(Obstacle.id == obstacle_id).first()
    if not obstacle:
        raise HTTPException(status_code=404, detail="obstacle not found")

    db.delete(obstacle)
    db.commit()


# safety zones for airport
def list_safety_zones(db: Session, airport_id: UUID) -> list[dict]:
    """list all safety zones for an airport"""
    zones = db.query(SafetyZone).filter(SafetyZone.airport_id == airport_id).all()

    return [_to_dict(zone, ZONE_GEOM, db) for zone in zones]


def create_safety_zone(db: Session, airport_id: UUID, data: dict) -> dict:
    """create a safety zone"""
    zone = SafetyZone(airport_id=airport_id)
    _set_fields(zone, data, ZONE_GEOM)
    db.add(zone)
    db.commit()
    db.refresh(zone)

    return _to_dict(zone, ZONE_GEOM, db)


def update_safety_zone(db: Session, zone_id: UUID, data: dict) -> dict:
    """update a safety zone"""
    zone = db.query(SafetyZone).filter(SafetyZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="safety zone not found")

    _set_fields(zone, data, ZONE_GEOM)
    db.commit()
    db.refresh(zone)

    return _to_dict(zone, ZONE_GEOM, db)


def delete_safety_zone(db: Session, zone_id: UUID):
    """delete a safety zone"""
    zone = db.query(SafetyZone).filter(SafetyZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="safety zone not found")

    db.delete(zone)
    db.commit()


# AGLs for airport surfaces
def list_agls(db: Session, surface_id: UUID) -> list[dict]:
    """list all AGLs for a surface"""
    agls = db.query(AGL).options(joinedload(AGL.lhas)).filter(AGL.surface_id == surface_id).all()

    return [_agl_dict(agl, db) for agl in agls]


def create_agl(db: Session, surface_id: UUID, data: dict) -> dict:
    """create an AGL"""
    agl = AGL(surface_id=surface_id)
    _set_fields(agl, data, AGL_GEOM)
    db.add(agl)
    db.commit()
    db.refresh(agl)

    return _to_dict(agl, AGL_GEOM, db)


def update_agl(db: Session, agl_id: UUID, data: dict) -> dict:
    """update an AGL"""
    agl = db.query(AGL).filter(AGL.id == agl_id).first()
    if not agl:
        raise HTTPException(status_code=404, detail="agl not found")

    _set_fields(agl, data, AGL_GEOM)
    db.commit()
    db.refresh(agl)

    return _to_dict(agl, AGL_GEOM, db)


def delete_agl(db: Session, agl_id: UUID):
    """delete an AGL"""
    agl = db.query(AGL).filter(AGL.id == agl_id).first()
    if not agl:
        raise HTTPException(status_code=404, detail="agl not found")

    db.delete(agl)
    db.commit()


# LHAs for airport surfaces
def list_lhas(db: Session, agl_id: UUID) -> list[dict]:
    """list all LHAs for an AGL"""
    lhas = db.query(LHA).filter(LHA.agl_id == agl_id).all()

    return [_to_dict(lha, LHA_GEOM, db) for lha in lhas]


def create_lha(db: Session, agl_id: UUID, data: dict) -> dict:
    """create an LHA"""
    lha = LHA(agl_id=agl_id)
    _set_fields(lha, data, LHA_GEOM)
    db.add(lha)
    db.commit()
    db.refresh(lha)

    return _to_dict(lha, LHA_GEOM, db)


def update_lha(db: Session, lha_id: UUID, data: dict) -> dict:
    """update an LHA"""
    lha = db.query(LHA).filter(LHA.id == lha_id).first()
    if not lha:
        raise HTTPException(status_code=404, detail="lha not found")

    _set_fields(lha, data, LHA_GEOM)
    db.commit()
    db.refresh(lha)

    return _to_dict(lha, LHA_GEOM, db)


def delete_lha(db: Session, lha_id: UUID):
    """delete an LHA"""
    lha = db.query(LHA).filter(LHA.id == lha_id).first()
    if not lha:
        raise HTTPException(status_code=404, detail="lha not found")

    db.delete(lha)
    db.commit()
