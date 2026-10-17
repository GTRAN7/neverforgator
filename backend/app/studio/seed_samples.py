"""Builds the shared palaces everyone sees on the studio home screen. From backend/:

    python -m app.studio.seed_samples --reitz <folder>

1. "Reitz Union" (built in): rooms and stops, no facts. "Start memorizing" gives each user their own
   copy, so they can paste notes right away without taking any photos.
   <folder> is a Reitz palace exported by the old Node server (palace.json + its room files).
2. "Sample: the phases of mitosis": the same route already filled with a real study example,
   pictures included. The onboarding tour opens it; anyone can walk and quiz it (read-only).
They belong to the "system" user, so nobody can change or delete them. Run again to rebuild them.
Needs GEMINI_API_KEY for real stops and scenes (mock mode works too, with placeholder text).
"""
import argparse
import json
from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Palace, PalaceStop, Room, User
from app.studio import gemini
from app.studio.files import link_or_copy, palace_dir
from app.studio.fill import fill_palace, set_order
from app.studio.router import copy_palace

MITOSIS_NOTES = """The phases of mitosis (how one cell splits into two identical cells), in order: P-M-A-T, then cytokinesis.
Prophase: the chromosomes condense into thick X shapes and the nuclear envelope breaks down.
Metaphase: the chromosomes line up single file across the middle of the cell (the metaphase plate).
Anaphase: spindle fibers pull the sister chromatids apart, toward opposite ends of the cell.
Telophase: two new nuclear envelopes form, one around each set of chromosomes.
Cytokinesis: the cytoplasm pinches in two, leaving two separate, identical daughter cells."""

def system_user(db) -> User:
    user = db.scalars(select(User).where(User.auth0_sub == "system")).first()
    if not user:
        user = User(auth0_sub="system", name="NeverForgator")
        db.add(user)
        db.commit()
    return user


def import_node_palace(db, folder: Path, owner: User) -> Palace:
    """A palace saved by the old Node server (palace.json + files) -> the database."""
    data = json.loads((folder / "palace.json").read_text())
    palace = Palace(user_id=owner.id, title=data["name"])
    db.add(palace)
    db.flush()
    room_ids = {}
    for i, room in enumerate(data["rooms"]):
        link_or_copy(folder / room["file"], palace_dir(palace.id) / room["file"])
        new = Room(palace_id=palace.id, position=i, name=room["name"], type=room["type"],
                   file=room["file"], flipped=room.get("flipped", False))
        db.add(new)
        db.flush()
        room_ids[room["id"]] = new.id
    for i, spot in enumerate(data["spots"]):
        if spot.get("crop") and (folder / spot["crop"]).exists():
            link_or_copy(folder / spot["crop"], palace_dir(palace.id) / spot["crop"])
        db.add(PalaceStop(palace_id=palace.id, room_id=room_ids[spot["roomId"]], stop_order=i + 1,
                          direction=spot.get("direction"), point=spot.get("point"), view_from=spot.get("viewFrom"),
                          label=spot.get("label"), crop=spot.get("crop")))
    db.commit()
    db.refresh(palace)
    return palace


def draw_pictures(db, palace: Palace, style: str) -> None:
    for stop in palace.stops:
        if stop.image_prompt:
            crop_path = palace_dir(palace.id) / stop.crop if stop.crop else None
            crop = crop_path.read_bytes() if crop_path and crop_path.exists() else None
            stop.image = gemini.generate_image(stop.image_prompt, crop, style)
            print(f"  {stop.label}: {stop.concept}")
    db.commit()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reitz", type=Path, required=True, help="folder with the Reitz palace.json and its files")
    args = parser.parse_args()
    gemini.choose_models()

    with SessionLocal() as db:
        system = system_user(db)
        for old in db.scalars(select(Palace).where(Palace.user_id == system.id)).all():
            db.delete(old)
        db.commit()

        # 1. The built-in Reitz route.
        reitz = import_node_palace(db, args.reitz, system)
        reitz.title, reitz.template, reitz.built_in = "Reitz Union", True, True
        db.commit()
        print(f"Built-in route: Reitz Union (id {reitz.id}), {len(reitz.stops)} stops, {len(reitz.rooms)} rooms")

        # 2. The finished mitosis example: same route, filled, only the filled stops kept.
        sample = copy_palace(db, reitz, system)
        sample.title, sample.template, sample.sample = "Sample: the phases of mitosis", True, True
        db.commit()
        db.refresh(sample)
        print("Filling the sample with the mitosis notes…")
        fill_palace(db, sample, MITOSIS_NOTES, "sticker", "silly")
        db.refresh(sample)
        draw_pictures(db, sample, "sticker")
        for stop in [s for s in sample.stops if not s.concept]:
            db.delete(stop)
        db.flush()
        db.refresh(sample)
        set_order(db, list(sample.stops))
        db.commit()
        print(f"Sample: id {sample.id}")


if __name__ == "__main__":
    main()
