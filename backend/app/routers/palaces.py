"""Save, list, open and delete memory palaces.

Ownership rule: every query includes `Palace.user_id == user.id`. If you ask
for someone else's palace you get 404 "not found", not 403 "forbidden", so the
API doesn't even confirm that the palace exists.
"""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import get_current_user
from app.db import get_db
from app.models import Location, Palace, PalaceStop, QuizAttempt, QuizQuestion, User
from app.schemas import (
    AttemptIn,
    AttemptOut,
    PalaceCreate,
    PalaceCreated,
    PalaceDetail,
    PalaceSummary,
)

router = APIRouter(prefix="/palaces", tags=["palaces"])


def get_owned_palace(db: Session, palace_id: int, user: User, *, load_all=False) -> Palace:
    """Load a palace only if it belongs to this user; otherwise 404."""
    stmt = select(Palace).where(Palace.id == palace_id, Palace.user_id == user.id)
    if load_all:
        # Load stops, their locations and their questions in a few batched
        # queries instead of one query per stop (avoids the "N+1 query" problem).
        stmt = stmt.options(
            selectinload(Palace.stops).joinedload(PalaceStop.location),
            selectinload(Palace.stops).selectinload(PalaceStop.questions),
        )
    palace = db.scalars(stmt).first()
    if palace is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Palace not found")
    return palace


def create_palace_for_user(db: Session, user: User, body: PalaceCreate) -> Palace:
    """Turn the request body into rows and save them in ONE transaction:
    either the palace, all its stops and all its questions are saved, or nothing is.

    This is a plain function (not just a route) so the Gemini "generate" endpoint
    can call it directly with the AI's output."""
    # Locations with route_order <= 0 were removed from the route (see seed.py).
    route = db.scalars(
        select(Location).where(Location.route_order > 0).order_by(Location.route_order)
    ).all()
    locations_by_id = {loc.id: loc for loc in route}

    if len(body.stops) > len(route):
        raise HTTPException(
            400, f"Too many concepts: the route only has {len(route)} stops"
        )

    stops: list[PalaceStop] = []
    used_locations: set[int] = set()
    for i, s in enumerate(body.stops):
        # Default: the i-th concept goes to the i-th location on the walking route.
        location_id = s.location_id if s.location_id is not None else route[i].id
        if location_id not in locations_by_id:
            raise HTTPException(400, f"Unknown location_id {location_id}")
        if location_id in used_locations:
            raise HTTPException(400, f"Location {location_id} is used twice")
        used_locations.add(location_id)

        stops.append(
            PalaceStop(
                location_id=location_id,
                stop_order=s.stop_order if s.stop_order is not None else i + 1,
                concept=s.concept,
                association=s.association,
                questions=[
                    QuizQuestion(
                        question=q.question,
                        answer=q.answer,
                        type=q.type,
                        choices=q.choices,
                    )
                    for q in s.questions
                ],
            )
        )

    orders = [st.stop_order for st in stops]
    if len(set(orders)) != len(orders):
        raise HTTPException(400, "Two stops have the same stop_order")

    palace = Palace(
        user_id=user.id, title=body.title, source_text=body.source_text, stops=stops
    )
    db.add(palace)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Could not save palace: invalid data")
    return palace


@router.post("", response_model=PalaceCreated, status_code=status.HTTP_201_CREATED)
def create_palace(
    body: PalaceCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a new palace with its stops and quiz questions."""
    palace = create_palace_for_user(db, user, body)
    return PalaceCreated(id=palace.id)


@router.get("", response_model=list[PalaceSummary])
def list_palaces(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The dashboard list: my palaces, newest first, with how many stops each has."""
    stmt = (
        select(
            Palace.id,
            Palace.title,
            Palace.created_at,
            func.count(PalaceStop.id).label("stop_count"),
        )
        .outerjoin(PalaceStop, PalaceStop.palace_id == Palace.id)
        .where(Palace.user_id == user.id)
        .group_by(Palace.id, Palace.title, Palace.created_at)
        .order_by(Palace.created_at.desc(), Palace.id.desc())
    )
    return [
        PalaceSummary(id=r.id, title=r.title, created_at=r.created_at, stop_count=r.stop_count)
        for r in db.execute(stmt)
    ]


@router.get("/{palace_id}", response_model=PalaceDetail)
def open_palace(
    palace_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One palace with every stop (in walking order), its location and its questions."""
    palace = get_owned_palace(db, palace_id, user, load_all=True)
    return PalaceDetail.model_validate(palace)


@router.delete("/{palace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_palace(
    palace_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a palace. Its stops, questions and attempts are deleted with it."""
    palace = get_owned_palace(db, palace_id, user)
    db.delete(palace)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- quiz attempts ----------

@router.post(
    "/{palace_id}/attempts", response_model=AttemptOut, status_code=status.HTTP_201_CREATED
)
def record_attempt(
    palace_id: int,
    body: AttemptIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a quiz score, e.g. {"score": 7, "total": 9}."""
    get_owned_palace(db, palace_id, user)
    attempt = QuizAttempt(palace_id=palace_id, user_id=user.id, score=body.score, total=body.total)
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return AttemptOut.model_validate(attempt)


@router.get("/{palace_id}/attempts", response_model=list[AttemptOut])
def list_attempts(
    palace_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Score history for one palace, oldest first (ready for a progress chart)."""
    get_owned_palace(db, palace_id, user)
    rows = db.scalars(
        select(QuizAttempt)
        .where(QuizAttempt.palace_id == palace_id, QuizAttempt.user_id == user.id)
        .order_by(QuizAttempt.taken_at, QuizAttempt.id)
    ).all()
    return [AttemptOut.model_validate(r) for r in rows]
