"""The shared palaces everyone sees on the studio home screen, built from files in the repo
(app/data/reitz/), so every teammate gets them without any Gemini calls:

1. "Reitz Union" (built in): three panoramas with their stops, no facts. "Start memorizing" gives each
   user their own copy, so they can paste notes right away without taking any photos.
2. "Sample: the phases of mitosis": the same route already filled with a real study example
   (scenes, hooks and doodles included). The onboarding tour opens it; anyone can walk and quiz it.

They belong to the "system" user, so nobody can change or delete them. The backend creates them on
startup if they're missing; to rebuild them by hand, from backend/:

    python -m app.studio.seed_samples
"""
import json
import logging
from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Palace, PalaceStop, Room, User
from app.studio.files import CACHE_DIR, link_or_copy, palace_dir

DATA = Path(__file__).resolve().parents[1] / "data" / "reitz"
log = logging.getLogger("loci.seed")


def system_user(db) -> User:
    user = db.scalars(select(User).where(User.auth0_sub == "system")).first()
    if not user:
        user = User(auth0_sub="system", name="NeverForgator")
        db.add(user)
        db.commit()
    return user


def _build(db, owner: User, title: str, rooms: list[dict], stops: list[dict], **fields) -> Palace:
    palace = Palace(user_id=owner.id, title=title, template=True, **fields)
    db.add(palace)
    db.flush()
    folder = palace_dir(palace.id)
    room_ids = []
    for i, room in enumerate(rooms):
        link_or_copy(DATA / room["file"], folder / room["file"])
        new = Room(palace_id=palace.id, position=i, name=room["name"], type=room["type"], file=room["file"])
        db.add(new)
        db.flush()
        room_ids.append(new.id)
    for i, stop in enumerate(stops):
        if stop.get("crop"):
            link_or_copy(DATA / stop["crop"], folder / stop["crop"])
        if stop.get("image") and not (CACHE_DIR / stop["image"]).exists():
            link_or_copy(DATA / stop["image"], CACHE_DIR / stop["image"])  # pictures are served from the cache
        db.add(PalaceStop(
            palace_id=palace.id, room_id=room_ids[stop["room"]], stop_order=i + 1,
            direction=stop["direction"], label=stop.get("label"), crop=stop.get("crop"),
            concept=stop.get("fact"), kind=stop.get("kind"), key_terms=stop.get("keyTerms"),
            association=stop.get("scene"), hook=stop.get("hook"), image_prompt=stop.get("imagePrompt"),
            image=stop.get("image"),
        ))
    db.commit()
    return palace


def seed(db) -> None:
    """(Re)build the shared palaces."""
    system = system_user(db)
    for old in db.scalars(select(Palace).where(Palace.user_id == system.id)).all():
        db.delete(old)
    db.commit()

    route = json.loads((DATA / "route.json").read_text())
    reitz = _build(db, system, route["name"], route["rooms"], route["stops"], built_in=True)

    example = json.loads((DATA / "mitosis.json").read_text(encoding="utf-8"))
    sample = _build(db, system, example["name"], route["rooms"], example["stops"], sample=True,
                    style=example["style"], flavor=example["flavor"], source_text=example["notes"])
    sample.copied_from = reitz.id
    db.commit()
    log.info("Shared palaces ready: Reitz Union (%s), mitosis example (%s)", reitz.id, sample.id)


def seed_if_missing() -> None:
    """On startup: build the shared palaces the first time (a fresh database, a new teammate)."""
    try:
        with SessionLocal() as db:
            if not db.scalars(select(Palace).where(Palace.built_in)).first():
                seed(db)
    except Exception as err:  # e.g. the tables aren't there yet
        log.warning("Could not set up the shared palaces (%s). Did you run `alembic upgrade head`?", err)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        seed(db)
