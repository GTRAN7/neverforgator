from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Location
from app.schemas import LocationOut

router = APIRouter(tags=["locations"])


@router.get("/locations", response_model=list[LocationOut])
def list_locations(db: Session = Depends(get_db)):
    """All campus stops in walking order. Public: the map can show them before login."""
    rows = db.scalars(select(Location).where(Location.route_order > 0).order_by(Location.route_order)).all()
    return [LocationOut.model_validate(r) for r in rows]
