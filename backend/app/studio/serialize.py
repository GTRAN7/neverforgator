"""Palaces as JSON for the frontend (the shape the React app has always used, camelCase)."""
from app.models import Palace, PalaceStop, Room, User
from app.studio.files import palace_dir


def can_read(palace: Palace, user: User) -> bool:
    """Your own palaces, plus shared ones (the built-in Reitz route, the example)."""
    return palace.user_id == user.id or palace.template


def can_write(palace: Palace, user: User) -> bool:
    return palace.user_id == user.id


def iso(dt):
    return dt.isoformat() if dt else None


def thumb_of(room: Room):
    """A small copy of the room photo for the room strip and home cards, when there is one
    (thumb-<file>, shipped with the built-in rooms), so they don't download the full panorama."""
    name = f"thumb-{room.file}"
    return name if (palace_dir(room.palace_id) / name).exists() else None


def room_json(room: Room) -> dict:
    return {"id": room.id, "name": room.name, "type": room.type, "file": room.file, "flipped": room.flipped,
            "thumb": thumb_of(room)}


def spot_json(stop: PalaceStop) -> dict:
    return {
        "id": stop.id,
        "roomId": stop.room_id,
        "direction": stop.direction,
        "point": stop.point,
        "viewFrom": stop.view_from,
        "label": stop.label,
        "crop": stop.crop,
        "auto": stop.auto,
        "fact": stop.concept,
        "kind": stop.kind,
        "keyTerms": stop.key_terms,
        "scene": stop.association,
        "hook": stop.hook,
        "imagePrompt": stop.image_prompt,
        "image": stop.image,
        "weirdness": stop.weirdness,
        "misses": stop.misses,
    }


def palace_json(palace: Palace, user: User) -> dict:
    return {
        "id": palace.id,
        "name": palace.title,
        "place": palace.place or palace.title,
        "createdAt": iso(palace.created_at),
        "notes": palace.source_text,
        "style": palace.style,
        "flavor": palace.flavor,
        "template": palace.template,
        "builtIn": palace.built_in,
        "sample": palace.sample,
        "copiedFrom": palace.copied_from,
        "fillReport": palace.fill_report,
        "nextReviewAt": iso(palace.next_review_at),
        "reviews": [{"at": iso(a.taken_at), "score": a.score, "total": a.total} for a in palace.attempts],
        "readOnly": not can_write(palace, user),
        "rooms": [room_json(r) for r in palace.rooms],
        # Studio stops only (campus-route stops have a location instead of a room).
        "spots": [spot_json(s) for s in palace.stops if s.room_id is not None],
    }


def summary_json(palace: Palace, user: User) -> dict:
    """One row on the home screen."""
    spots = [s for s in palace.stops if s.room_id is not None]
    first = next((r for r in palace.rooms if r.type != "splat"), None)
    cover = (thumb_of(first) or first.file) if first else None
    return {
        "id": palace.id,
        "name": palace.title,
        "place": palace.place or palace.title,
        "createdAt": iso(palace.created_at),
        "roomCount": len(palace.rooms),
        "spotCount": len(spots),
        "friendCount": sum(1 for s in spots if s.concept),
        "nextReviewAt": iso(palace.next_review_at),
        "template": palace.template,
        "builtIn": palace.built_in,
        "sample": palace.sample,
        "cover": cover,
        "mine": can_write(palace, user),
    }
