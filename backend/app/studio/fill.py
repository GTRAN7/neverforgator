"""Fill: notes -> the whole palace.

The memory-athlete order: cut the notes into ideas (one picture each), give every idea its own stop
(the user's placed stops first, then stops Gemini finds in the room photos), then write a scene per
stop. Ideas that don't fit wait, and the UI asks for more room instead of cramming stops together.
Used by POST /api/palaces/{id}/fill and by the seed scripts."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Palace, PalaceStop
from app.studio import gemini
from app.studio.files import palace_dir
from app.studio.panorama import angle_between, image_size, photo_point_to_direction

MIME = {".png": "image/png", ".webp": "image/webp"}


def set_order(db: Session, stops: list[PalaceStop]) -> None:
    """Make `stops` the walking path, in this order. stop_order must stay unique per palace,
    so park everything on negative numbers first, then number them 1, 2, 3..."""
    for i, stop in enumerate(stops):
        stop.stop_order = -(i + 1)
    db.flush()
    for i, stop in enumerate(stops):
        stop.stop_order = i + 1
    db.flush()


def find_extra_stops(palace: Palace, kept: list[PalaceStop], needed: int) -> list[dict]:
    """Stops Gemini finds in the room photos (panoramas and flat photos; not 3D scans).
    Every room is looked at in parallel, once (then cached)."""
    rooms = [r for r in palace.rooms if r.type in ("panorama", "photo")]

    def scan(room):
        data = (palace_dir(palace.id) / room.file).read_bytes()
        width, height = image_size(data) or (2, 1)
        mime = next((m for ext, m in MIME.items() if room.file.endswith(ext)), "image/jpeg")
        stops = gemini.find_stops(data, mime, room.file, room.type)
        # Left to right in the photo = walking around the room.
        return [{
            "room_id": room.id,
            "label": stop["label"].strip()[:40],
            "direction": photo_point_to_direction(stop["x"] / 1000, stop["y"] / 1000, width, height, room.type),
        } for stop in sorted(stops, key=lambda s: s["x"])]

    with ThreadPoolExecutor(max_workers=6) as pool:
        per_room = list(pool.map(scan, rooms))

    # Skip stops too close to another one, or named like another one (two "foosball table" stops
    # in overlapping photos): stops you can't tell apart in your head mix up their facts.
    found = []
    names = {(s.label or "").lower() for s in kept}
    taken = [(s.room_id, s.direction) for s in kept if s.direction]
    for stop in (s for room in per_room for s in room):
        if len(found) >= needed:
            break
        too_close = any(room_id == stop["room_id"] and angle_between(d, stop["direction"]) < 0.25
                        for room_id, d in taken)
        if too_close or stop["label"].lower() in names:
            continue
        names.add(stop["label"].lower())
        taken.append((stop["room_id"], stop["direction"]))
        found.append(stop)
    return found


def fill_palace(db: Session, palace: Palace, notes: str, style: str, flavor: str = "wild") -> Palace:
    if not palace.rooms:
        raise HTTPException(400, "Add a room first")
    ideas = gemini.split_notes(notes)
    if not ideas:
        raise HTTPException(400, "Couldn’t find anything to remember in those notes")

    # Stops added by an earlier fill are rebuilt each time; stops the user placed are kept.
    studio_stops = [s for s in palace.stops if s.room_id is not None]
    for stop in studio_stops:
        if stop.auto:
            db.delete(stop)
    db.flush()
    kept = [s for s in studio_stops if not s.auto]
    extra = find_extra_stops(palace, kept, len(ideas) - len(kept)) if len(kept) < len(ideas) else []

    # The path walks room by room (in the order of the room strip), like a real walk.
    room_index = {r.id: i for i, r in enumerate(palace.rooms)}
    new_stops = [PalaceStop(palace_id=palace.id, room_id=e["room_id"], direction=e["direction"], label=e["label"],
                            auto=True, stop_order=-10_000 - i) for i, e in enumerate(extra)]
    db.add_all(new_stops)
    walk = sorted(kept + new_stops, key=lambda s: room_index.get(s.room_id, -1))
    stop_count = min(len(walk), len(ideas))
    if not stop_count:
        raise HTTPException(400, "No stops yet. Plant a few eggs by clicking your room, or add a panorama.")

    placed = ideas[:stop_count]
    items = gemini.write_scenes(placed, [s.label or f"spot {i + 1}" for i, s in enumerate(walk[:stop_count])], flavor)
    by_location = {item["location"]: item for item in items}
    for i, stop in enumerate(walk):
        item = by_location.get(i + 1) if i < stop_count else None
        idea = placed[i] if item else None
        stop.concept = idea["text"][:300] if idea else None
        stop.kind = idea["kind"] if idea else None
        stop.key_terms = idea["keyTerms"] if idea else None
        stop.association = item["scene"] if item else None
        stop.hook = item["hook"] if item else None
        stop.image_prompt = item["imagePrompt"] if item else None
        stop.image = None
        stop.weirdness = 0
        stop.misses = 0
    # Found stops that ended up without an idea aren't kept.
    for stop in walk:
        if stop.auto and not stop.concept:
            db.delete(stop)
    walk = [s for s in walk if not (s.auto and not s.concept)]
    db.flush()
    set_order(db, walk)

    your_stops = sum(1 for s in kept if walk.index(s) < stop_count)
    palace.source_text = notes
    palace.style = style
    palace.flavor = flavor
    # What didn't fit, so the UI can say how many more stops the notes need.
    palace.fill_report = {
        "ideas": len(ideas),
        "yourStops": your_stops,
        "foundStops": stop_count - your_stops,
        "waiting": [idea["text"] for idea in ideas[stop_count:]],
    }
    # Fresh material: the first review is right away (see /reviews).
    palace.next_review_at = datetime.now(timezone.utc)
    for attempt in list(palace.attempts):
        db.delete(attempt)
    db.commit()
    db.refresh(palace)
    return palace
