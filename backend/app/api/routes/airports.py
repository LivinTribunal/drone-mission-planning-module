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
from app.services import airport_service

router = APIRouter(prefix="/api/v1/airports", tags=["airports"])


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
    return airport_service.create_airport(db, body.model_dump())


@router.put("/{airport_id}", response_model=AirportResponse)
def update_airport(airport_id: UUID, body: AirportUpdate, db: Session = Depends(get_db)):
    """update airport"""
    data = body.model_dump(exclude_unset=True)
    return airport_service.update_airport(db, airport_id, data)


@router.delete("/{airport_id}", status_code=204)
def delete_airport(airport_id: UUID, db: Session = Depends(get_db)):
    """delete airport"""
    airport_service.delete_airport(db, airport_id)
