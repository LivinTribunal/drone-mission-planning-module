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


def _set_fields(obj, data: dict, geom_fields: list[str]):
    for key, val in data.items():
        if key in geom_fields and val is not None:
            setattr(obj, key, geojson_to_ewkt(val))
        else:
            setattr(obj, key, val)


def _to_dict(obj, geom_fields: list[str], db: Session) -> dict:
    result = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.name)
        if col.name in geom_fields:
            result[col.name] = wkb_to_geojson(val, db)
        else:
            result[col.name] = val
    return result


def _airport_dict(a: Airport, db: Session) -> dict:
    return _to_dict(a, AIRPORT_GEOM, db)


def _surface_dict(s: AirfieldSurface, db: Session) -> dict:
    d = _to_dict(s, SURFACE_GEOM, db)
    d["agls"] = [_agl_dict(a, db) for a in s.agls]
    return d


def _agl_dict(a: AGL, db: Session) -> dict:
    d = _to_dict(a, AGL_GEOM, db)
    d["lhas"] = [_to_dict(lha, LHA_GEOM, db) for lha in a.lhas]
    return d


def _detail_dict(a: Airport, db: Session) -> dict:
    d = _airport_dict(a, db)
    d["surfaces"] = [_surface_dict(s, db) for s in a.surfaces]
    d["obstacles"] = [_to_dict(o, OBSTACLE_GEOM, db) for o in a.obstacles]
    d["safety_zones"] = [_to_dict(z, ZONE_GEOM, db) for z in a.safety_zones]
    return d


# airports


def list_airports(db: Session) -> list[dict]:
    airports = db.query(Airport).all()
    return [_airport_dict(a, db) for a in airports]


def get_airport(db: Session, airport_id: UUID) -> dict:
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
    airport = Airport()
    _set_fields(airport, data, AIRPORT_GEOM)
    db.add(airport)
    db.commit()
    db.refresh(airport)
    return _airport_dict(airport, db)


def update_airport(db: Session, airport_id: UUID, data: dict) -> dict:
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise HTTPException(status_code=404, detail="airport not found")
    _set_fields(airport, data, AIRPORT_GEOM)
    db.commit()
    db.refresh(airport)
    return _airport_dict(airport, db)


def delete_airport(db: Session, airport_id: UUID):
    airport = db.query(Airport).filter(Airport.id == airport_id).first()
    if not airport:
        raise HTTPException(status_code=404, detail="airport not found")
    db.delete(airport)
    db.commit()


# surfaces


def list_surfaces(db: Session, airport_id: UUID) -> list[dict]:
    surfaces = (
        db.query(AirfieldSurface)
        .options(joinedload(AirfieldSurface.agls).joinedload(AGL.lhas))
        .filter(AirfieldSurface.airport_id == airport_id)
        .all()
    )
    return [_surface_dict(s, db) for s in surfaces]


def create_surface(db: Session, airport_id: UUID, data: dict) -> dict:
    surface = AirfieldSurface(airport_id=airport_id)
    _set_fields(surface, data, SURFACE_GEOM)
    db.add(surface)
    db.commit()
    db.refresh(surface)
    return _to_dict(surface, SURFACE_GEOM, db)


def update_surface(db: Session, surface_id: UUID, data: dict) -> dict:
    surface = db.query(AirfieldSurface).filter(AirfieldSurface.id == surface_id).first()
    if not surface:
        raise HTTPException(status_code=404, detail="surface not found")
    _set_fields(surface, data, SURFACE_GEOM)
    db.commit()
    db.refresh(surface)
    return _to_dict(surface, SURFACE_GEOM, db)


def delete_surface(db: Session, surface_id: UUID):
    surface = db.query(AirfieldSurface).filter(AirfieldSurface.id == surface_id).first()
    if not surface:
        raise HTTPException(status_code=404, detail="surface not found")
    db.delete(surface)
    db.commit()


# obstacles


def list_obstacles(db: Session, airport_id: UUID) -> list[dict]:
    obstacles = db.query(Obstacle).filter(Obstacle.airport_id == airport_id).all()
    return [_to_dict(o, OBSTACLE_GEOM, db) for o in obstacles]


def create_obstacle(db: Session, airport_id: UUID, data: dict) -> dict:
    obs = Obstacle(airport_id=airport_id)
    _set_fields(obs, data, OBSTACLE_GEOM)
    db.add(obs)
    db.commit()
    db.refresh(obs)
    return _to_dict(obs, OBSTACLE_GEOM, db)


def update_obstacle(db: Session, obstacle_id: UUID, data: dict) -> dict:
    obs = db.query(Obstacle).filter(Obstacle.id == obstacle_id).first()
    if not obs:
        raise HTTPException(status_code=404, detail="obstacle not found")
    _set_fields(obs, data, OBSTACLE_GEOM)
    db.commit()
    db.refresh(obs)
    return _to_dict(obs, OBSTACLE_GEOM, db)


def delete_obstacle(db: Session, obstacle_id: UUID):
    obs = db.query(Obstacle).filter(Obstacle.id == obstacle_id).first()
    if not obs:
        raise HTTPException(status_code=404, detail="obstacle not found")
    db.delete(obs)
    db.commit()


# safety zones


def list_safety_zones(db: Session, airport_id: UUID) -> list[dict]:
    zones = db.query(SafetyZone).filter(SafetyZone.airport_id == airport_id).all()
    return [_to_dict(z, ZONE_GEOM, db) for z in zones]


def create_safety_zone(db: Session, airport_id: UUID, data: dict) -> dict:
    zone = SafetyZone(airport_id=airport_id)
    _set_fields(zone, data, ZONE_GEOM)
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return _to_dict(zone, ZONE_GEOM, db)


def update_safety_zone(db: Session, zone_id: UUID, data: dict) -> dict:
    zone = db.query(SafetyZone).filter(SafetyZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="safety zone not found")
    _set_fields(zone, data, ZONE_GEOM)
    db.commit()
    db.refresh(zone)
    return _to_dict(zone, ZONE_GEOM, db)


def delete_safety_zone(db: Session, zone_id: UUID):
    zone = db.query(SafetyZone).filter(SafetyZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="safety zone not found")
    db.delete(zone)
    db.commit()


# AGLs


def list_agls(db: Session, surface_id: UUID) -> list[dict]:
    agls = db.query(AGL).options(joinedload(AGL.lhas)).filter(AGL.surface_id == surface_id).all()
    return [_agl_dict(a, db) for a in agls]


def create_agl(db: Session, surface_id: UUID, data: dict) -> dict:
    agl = AGL(surface_id=surface_id)
    _set_fields(agl, data, AGL_GEOM)
    db.add(agl)
    db.commit()
    db.refresh(agl)
    return _to_dict(agl, AGL_GEOM, db)


def update_agl(db: Session, agl_id: UUID, data: dict) -> dict:
    agl = db.query(AGL).filter(AGL.id == agl_id).first()
    if not agl:
        raise HTTPException(status_code=404, detail="agl not found")
    _set_fields(agl, data, AGL_GEOM)
    db.commit()
    db.refresh(agl)
    return _to_dict(agl, AGL_GEOM, db)


def delete_agl(db: Session, agl_id: UUID):
    agl = db.query(AGL).filter(AGL.id == agl_id).first()
    if not agl:
        raise HTTPException(status_code=404, detail="agl not found")
    db.delete(agl)
    db.commit()


# LHAs


def list_lhas(db: Session, agl_id: UUID) -> list[dict]:
    lhas = db.query(LHA).filter(LHA.agl_id == agl_id).all()
    return [_to_dict(lha, LHA_GEOM, db) for lha in lhas]


def create_lha(db: Session, agl_id: UUID, data: dict) -> dict:
    lha = LHA(agl_id=agl_id)
    _set_fields(lha, data, LHA_GEOM)
    db.add(lha)
    db.commit()
    db.refresh(lha)
    return _to_dict(lha, LHA_GEOM, db)


def update_lha(db: Session, lha_id: UUID, data: dict) -> dict:
    lha = db.query(LHA).filter(LHA.id == lha_id).first()
    if not lha:
        raise HTTPException(status_code=404, detail="lha not found")
    _set_fields(lha, data, LHA_GEOM)
    db.commit()
    db.refresh(lha)
    return _to_dict(lha, LHA_GEOM, db)


def delete_lha(db: Session, lha_id: UUID):
    lha = db.query(LHA).filter(LHA.id == lha_id).first()
    if not lha:
        raise HTTPException(status_code=404, detail="lha not found")
    db.delete(lha)
    db.commit()
