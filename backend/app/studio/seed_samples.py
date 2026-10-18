"""The shared palaces everyone sees on the studio home screen, built from files in the repo
(app/data/reitz/), so every teammate gets them without any Gemini calls:

1. "Reitz Union" (built in): three panoramas (game room, atrium, barbershop hallway) with their stops,
   no facts. "Start memorizing" gives each user their own copy, so they can paste notes right away
   without taking any photos.
2. "Sample: parts of a cell": the same route already filled with a real study example, each organelle
   at an object that does the same job (scenes, hooks and doodles included). The tour opens it; anyone can walk and quiz it.

They belong to the "system" user, so nobody can change or delete them. The backend creates them on
startup if they're missing or the files here changed; to rebuild them by hand, from backend/:

    python -m app.studio.seed_samples
"""
import hashlib
import json
import logging
import shutil
from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Palace, PalaceStop, Room, User
from app.studio.files import CACHE_DIR, link_or_copy, palace_dir

DATA = Path(__file__).resolve().parents[1] / "data" / "reitz"
log = logging.getLogger("loci.seed")


def files_version() -> str:
    """Changes whenever anything in app/data/reitz/ does (route, example, photos, doodles), so pulling
    new files rebuilds the shared palaces."""
    digest = hashlib.sha256()
    for path in sorted(DATA.iterdir()):
        digest.update(path.name.encode() + path.read_bytes())
    return digest.hexdigest()[:16]


def system_user(db) -> User:
    user = db.scalars(select(User).where(User.auth0_sub == "system")).first()
    if not user:
        user = User(auth0_sub="system", name="NeverForgator")
        db.add(user)
        db.commit()
    return user


def _build(db, owner: User, title: str, rooms: list[dict], stops: list[dict], **fields) -> Palace:
    palace = Palace(user_id=owner.id, title=title, place="Reitz Union", template=True, **fields)
    db.add(palace)
    db.flush()
    folder = palace_dir(palace.id)
    room_ids = []
    for i, room in enumerate(rooms):
        link_or_copy(DATA / room["file"], folder / room["file"])
        new = Room(palace_id=palace.id, position=i, name=room["name"], type=room["type"], file=room["file"],
                   flipped=room.get("flipped", False))  # most scan exports come in upside down
        db.add(new)
        db.flush()
        room_ids.append(new.id)
    for i, stop in enumerate(stops):
        if stop.get("crop"):
            link_or_copy(DATA / stop["crop"], folder / stop["crop"])
        image = stop.get("image")
        cached = CACHE_DIR / image if image else None
        # Pictures are served from the cache; refresh it when the repo's drawing changed.
        if image and (not cached.exists() or cached.read_bytes() != (DATA / image).read_bytes()):
            cached.unlink(missing_ok=True)
            link_or_copy(DATA / image, cached)
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
        shutil.rmtree(palace_dir(old.id), ignore_errors=True)
    db.commit()

    route = json.loads((DATA / "route.json").read_text())
    reitz = _build(db, system, route["name"], route["rooms"], route["stops"], built_in=True)

    example = json.loads((DATA / "example.json").read_text(encoding="utf-8"))
    sample = _build(db, system, example["name"], route["rooms"], example["stops"], sample=True,
                    style=example["style"], flavor=example["flavor"], source_text=example["notes"])
    sample.copied_from = reitz.id
    db.commit()
    (palace_dir(reitz.id) / ".version").write_text(files_version())
    log.info("Shared palaces ready: Reitz Union (%s), example (%s)", reitz.id, sample.id)


def seed_if_missing() -> None:
    """On startup: build the shared palaces the first time (a fresh database, a new teammate), and
    rebuild them after a pull that changed them. Copies people already made keep their own rooms."""
    try:
        with SessionLocal() as db:
            reitz = db.scalars(select(Palace).where(Palace.built_in)).first()
            stamp = palace_dir(reitz.id) / ".version" if reitz else None
            if not stamp or not stamp.exists() or stamp.read_text() != files_version():
                seed(db)
    except Exception as err:  # e.g. the tables aren't there yet
        log.warning("Could not set up the shared palaces (%s). Did you run `alembic upgrade head`?", err)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        seed(db)
