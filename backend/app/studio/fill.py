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
MAX_PER_ROOM = 12  # friends per room before it starts looking crowded (stops you place yourself are always used)


def set_order(db: Session, stops: list[PalaceStop]) -> None:
    """Make `stops` the walking path, in this order. stop_order must stay unique per palace,
    so park everything on negative numbers first, then number them 1, 2, 3..."""
    for i, stop in enumerate(stops):
        stop.stop_order = -(i + 1)
    db.flush()
    for i, stop in enumerate(stops):
        stop.stop_order = i + 1
    db.flush()


def first_eggs(eggs: list[PalaceStop], wanted: int, in_room: dict | None = None) -> list[PalaceStop]:
    """The eggs that hatch: the earliest planted first (lowest numbers), at most `wanted` of them,
    and never past MAX_PER_ROOM friends in a room (`in_room` counts friends already there).
    Eggs past that just stay eggs."""
    in_room = dict(in_room or {})
    picked = []
    for egg in sorted(eggs, key=lambda s: s.stop_order):
        if len(picked) >= wanted:
            break
        if in_room.get(egg.room_id, 0) >= MAX_PER_ROOM:
            continue
        in_room[egg.room_id] = in_room.get(egg.room_id, 0) + 1
        picked.append(egg)
    return picked


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
    # A room also stops getting found stops at MAX_PER_ROOM friends; past that it looks crowded.
    found = []
    names = {(s.label or "").lower() for s in kept}
    taken = [(s.room_id, s.direction) for s in kept if s.direction]
    in_room = {}
    for s in kept:
        in_room[s.room_id] = in_room.get(s.room_id, 0) + 1
    for stop in (s for room in per_room for s in room):
        if len(found) >= needed:
            break
        if in_room.get(stop["room_id"], 0) >= MAX_PER_ROOM:
            continue
        too_close = any(room_id == stop["room_id"] and angle_between(d, stop["direction"]) < 0.25
                        for room_id, d in taken)
        if too_close or stop["label"].lower() in names:
            continue
        in_room[stop["room_id"]] = in_room.get(stop["room_id"], 0) + 1
        names.add(stop["label"].lower())
        taken.append((stop["room_id"], stop["direction"]))
        found.append(stop)
    return found


def fill_palace(db: Session, palace: Palace, notes: str, style: str, flavor: str = "silly", add: bool = False) -> Palace:
    if not palace.rooms:
        raise HTTPException(400, "Add a room first")
    ideas = gemini.split_notes(notes)
    if not ideas:
        raise HTTPException(400, "Couldn’t find anything to remember in those notes")
    if add:
        return add_to_palace(db, palace, notes, ideas, style, flavor)

    # Stops added by an earlier fill are rebuilt each time; stops the user placed are kept.
    studio_stops = [s for s in palace.stops if s.room_id is not None]
    for stop in studio_stops:
        if stop.auto:
            db.delete(stop)
    db.flush()
    kept = sorted((s for s in studio_stops if not s.auto), key=lambda s: s.stop_order)
    # Your eggs hatch first, earliest planted first, up to MAX_PER_ROOM a room; found stops fill in after.
    hatching = first_eggs(kept, len(ideas))
    extra = find_extra_stops(palace, kept, len(ideas) - len(hatching)) if len(hatching) < len(ideas) else []

    # The path walks room by room (in the order of the room strip), like a real walk.
    room_index = {r.id: i for i, r in enumerate(palace.rooms)}
    new_stops = [PalaceStop(palace_id=palace.id, room_id=e["room_id"], direction=e["direction"], label=e["label"],
                            auto=True, stop_order=-10_000 - i) for i, e in enumerate(extra)]
    db.add_all(new_stops)
    # Eggs that don't hatch (no idea left, or their room is full) wait at the end of the walk.
    resting = [s for s in kept if s not in hatching]
    walk = sorted(hatching + new_stops, key=lambda s: room_index.get(s.room_id, -1)) + resting
    stop_count = len(hatching) + len(new_stops)
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


def add_to_palace(db: Session, palace: Palace, notes: str, ideas: list[dict], style: str, flavor: str) -> Palace:
    """"Add them": keep every friend the palace already has (same stop, scene and picture) and give
    the new ideas the empty eggs first, then stops Gemini finds in the room photos. New friends go
    at the end of the walk, so the stops you've already memorized keep their numbers."""
    studio_stops = sorted((s for s in palace.stops if s.room_id is not None), key=lambda s: s.stop_order)
    friends = [s for s in studio_stops if s.concept]
    # Notes that are already in the palace (e.g. pasting the same notes again) don't hatch twice.
    known = {" ".join(s.concept.lower().split()) for s in friends}
    ideas = [idea for idea in ideas if " ".join(idea["text"][:300].lower().split()) not in known]
    if not ideas:
        raise HTTPException(400, "Everything in those notes is already in this palace")

    eggs = [s for s in studio_stops if not s.concept]
    # Empty eggs hatch first, earliest planted first, but no room goes past MAX_PER_ROOM friends.
    in_room = {}
    for s in friends:
        in_room[s.room_id] = in_room.get(s.room_id, 0) + 1
    hatching = first_eggs(eggs, len(ideas), in_room)
    extra = find_extra_stops(palace, studio_stops, len(ideas) - len(hatching)) if len(hatching) < len(ideas) else []
    room_index = {r.id: i for i, r in enumerate(palace.rooms)}
    found = [PalaceStop(palace_id=palace.id, room_id=e["room_id"], direction=e["direction"], label=e["label"],
                        auto=True, stop_order=-10_000 - i) for i, e in enumerate(extra)]
    db.add_all(found)
    targets = hatching + sorted(found, key=lambda s: room_index.get(s.room_id, -1))
    stop_count = min(len(targets), len(ideas))
    if not stop_count:
        raise HTTPException(400, "No room for more friends. Plant a few eggs by clicking your room, or add a panorama.")

    placed = ideas[:stop_count]
    labels = [s.label or f"spot {len(friends) + i + 1}" for i, s in enumerate(targets[:stop_count])]
    items = gemini.write_scenes(placed, labels, flavor)
    by_location = {item["location"]: item for item in items}
    hatched = []
    for i, stop in enumerate(targets[:stop_count]):
        item = by_location.get(i + 1)
        if not item:
            continue
        idea = placed[i]
        stop.concept = idea["text"][:300]
        stop.kind = idea["kind"]
        stop.key_terms = idea["keyTerms"]
        stop.association = item["scene"]
        stop.hook = item["hook"]
        stop.image_prompt = item["imagePrompt"]
        stop.image = None
        stop.weirdness = 0
        stop.misses = 0
        hatched.append(stop)
    # Found stops that ended up without an idea aren't kept; eggs stay eggs.
    for stop in found:
        if not stop.concept:
            db.delete(stop)
    db.flush()
    hatched_ids = {s.id for s in hatched}
    still_eggs = [s for s in eggs if s.id not in hatched_ids]
    set_order(db, friends + hatched + still_eggs)

    palace.source_text = f"{palace.source_text.rstrip()}\n\n{notes}" if palace.source_text else notes
    palace.style = style
    palace.flavor = flavor
    your = sum(1 for s in hatched if not s.auto)
    palace.fill_report = {
        "ideas": len(ideas),
        "yourStops": your,
        "foundStops": len(hatched) - your,
        "waiting": [idea["text"] for idea in ideas[stop_count:]],
        "added": len(hatched),
    }
    palace.next_review_at = datetime.now(timezone.utc)  # new material: review it soon
    db.commit()
    db.refresh(palace)
    return palace
