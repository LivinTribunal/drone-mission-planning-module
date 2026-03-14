from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.airport import AirportCreate, AirportUpdate
from app.services import airport_service

router = APIRouter(prefix="/api/v1/airports", tags=["airports"])


@router.get("")
def list_airports(db: Session = Depends(get_db)):
    airports = airport_service.list_airports(db)
    return {"data": airports, "meta": {"total": len(airports)}}


@router.get("/{airport_id}")
def get_airport(airport_id: UUID, db: Session = Depends(get_db)):
    return airport_service.get_airport(db, airport_id)


@router.post("", status_code=201)
def create_airport(body: AirportCreate, db: Session = Depends(get_db)):
    return airport_service.create_airport(db, body.model_dump())


@router.put("/{airport_id}")
def update_airport(airport_id: UUID, body: AirportUpdate, db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    return airport_service.update_airport(db, airport_id, data)


@router.delete("/{airport_id}", status_code=204)
def delete_airport(airport_id: UUID, db: Session = Depends(get_db)):
    airport_service.delete_airport(db, airport_id)
