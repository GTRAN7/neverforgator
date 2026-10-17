"""The NeverForgator studio API: palaces built in rooms, filled from notes by Gemini.

Everything is under /api (the React app calls it through Vite's proxy). Thomas's campus-route API
(/palaces, /locations, /me) stays as it is; both use the same tables. Every route needs a login,
except /api/status and /api/describe (rate-limited per address)."""
import base64
import hashlib
import re
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth import get_current_user
from app.db import get_db
from app.models import Palace, PalaceStop, QuizAttempt, Room, User
from app.studio import gemini
from app.studio.files import link_or_copy, new_name, palace_dir
from app.studio.fill import fill_palace, set_order
from app.studio.limits import CAPS, burst_limit, ip_limit, quota, usage_for
from app.studio.panorama import image_size
from app.studio.serialize import can_read, can_write, palace_json, spot_json, summary_json

public = APIRouter(prefix="/api", tags=["studio"])
router = APIRouter(prefix="/api", tags=["studio"], dependencies=[Depends(burst_limit)])

IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
SPLAT_EXTENSIONS = {".ply", ".spz", ".splat", ".ksplat", ".sog"}
REVIEW_DAYS = [1, 3, 7, 21, 60]  # spaced review, like memory athletes do it


# ---------- helpers ----------

def load_palace(db: Session, palace_id: int, user: User, *, write: bool = False) -> Palace:
    """A palace this user may see (or change). Someone else's palace is a 404, so the API
    never confirms it exists; a shared one you can't change is a 403 with a hint."""
    palace = db.scalars(
        select(Palace).where(Palace.id == palace_id).options(
            selectinload(Palace.rooms), selectinload(Palace.stops), selectinload(Palace.attempts))
    ).first()
    if palace is None or not can_read(palace, user):
        raise HTTPException(404, "Palace not found")
    if write and not can_write(palace, user):
        raise HTTPException(403, "This is a shared palace. Start your own copy to change it.")
    return palace


def studio_stops(palace: Palace) -> list[PalaceStop]:
    return [s for s in palace.stops if s.room_id is not None]


def load_stop(palace: Palace, stop_id: int) -> PalaceStop:
    stop = next((s for s in studio_stops(palace) if s.id == stop_id), None)
    if stop is None:
        raise HTTPException(404, "Spot not found")
    return stop


def is_vector(v) -> bool:
    return isinstance(v, list) and len(v) == 3 and all(isinstance(x, (int, float)) for x in v)


def read_position(body: dict):
    """Where a spot is: a direction (panoramas, photos) or a 3D point + where the camera stood (scans)."""
    if is_vector(body.get("direction")):
        return {"direction": body["direction"], "point": None, "view_from": None}
    if is_vector(body.get("point")) and is_vector(body.get("viewFrom")):
        return {"direction": None, "point": body["point"], "view_from": body["viewFrom"]}
    return None


def save_crop(palace_id: int, crop: str | None):
    """Saves what the user clicked (a JPEG data URL): used to name the spot, and as the
    reference photo for its picture."""
    match = re.fullmatch(r"data:image/jpeg;base64,(.+)", crop or "", re.S)
    if not match:
        return None
    name = new_name("crop", ".jpg")
    (palace_dir(palace_id) / name).write_bytes(base64.b64decode(match.group(1)))
    return name


def reload(db: Session, palace: Palace, user: User) -> dict:
    db.commit()
    db.expire_all()
    return palace_json(load_palace(db, palace.id, user), user)


# ---------- status, usage, imports ----------

@public.get("/status")
def status():
    return {"mock": gemini.MOCK, "pictures": gemini.PICTURES, "models": gemini.models, "caps": CAPS}


@router.get("/usage")
def usage(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """How much of today's fair-use quota is left."""
    return usage_for(db, user)


IMPORT_TYPES = re.compile(r"^(image/(jpeg|png|webp|heic|heif)|application/pdf|audio/[\w.+-]+|video/webm)$")


@router.post("/import", dependencies=[Depends(quota("import"))])
async def import_notes(file: UploadFile = File(...)):
    """A photo of notes, a PDF or a voice recording -> text for the notes box."""
    if not IMPORT_TYPES.match(file.content_type or ""):
        raise HTTPException(400, "Import a photo (JPEG/PNG/HEIC), a PDF or an audio recording")
    data = await file.read(CAPS["importBytes"] + 1)
    if len(data) > CAPS["importBytes"]:
        raise HTTPException(400, "That file is too big (20 MB max)")
    # m4a voice memos arrive as audio/x-m4a; Gemini knows them as audio/mp4.
    mime = "audio/mp4" if file.content_type == "audio/x-m4a" else file.content_type
    result = gemini.extract_notes(data, mime, hashlib.sha256(data).hexdigest())
    return {"text": result["text"].strip()[:CAPS["notesChars"]]}


class DescribeIn(BaseModel):
    kind: str = Field(pattern="^(subject|term)$")
    text: str = Field(min_length=1, max_length=200)
    subject: str = Field(default="", max_length=200)
    place: str = Field(default="", max_length=200)


@public.post("/describe", dependencies=[Depends(ip_limit)])
def describe(body: DescribeIn):
    """Campus mode's AI buttons: 2-3 sentences about a subject or a term."""
    return {"description": gemini.describe(body.kind, body.text, body.subject, body.place)}


# ---------- palaces ----------

@router.get("/palaces")
def list_palaces(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Your palaces plus the shared ones, newest first."""
    rows = db.scalars(
        select(Palace).where((Palace.user_id == user.id) | Palace.template)
        .options(selectinload(Palace.rooms), selectinload(Palace.stops))
        .order_by(Palace.created_at.desc(), Palace.id.desc())
    ).all()
    return [summary_json(p, user) for p in rows]


class NameIn(BaseModel):
    name: str = ""


@router.post("/palaces", status_code=201)
def create_palace(body: NameIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    palace = Palace(user_id=user.id, title=body.name.strip()[:80] or "My palace")
    db.add(palace)
    db.commit()
    return palace_json(load_palace(db, palace.id, user), user)


@router.get("/palaces/{palace_id}")
def open_palace(palace_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return palace_json(load_palace(db, palace_id, user), user)


@router.patch("/palaces/{palace_id}")
def rename_palace(palace_id: int, body: NameIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    palace = load_palace(db, palace_id, user, write=True)
    if not body.name.strip():
        raise HTTPException(400, "Give it a name")
    palace.title = body.name.strip()[:80]
    return reload(db, palace, user)


@router.delete("/palaces/{palace_id}", status_code=204)
def delete_palace(palace_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    palace = load_palace(db, palace_id, user, write=True)
    db.delete(palace)
    db.commit()
    shutil.rmtree(palace_dir(palace_id), ignore_errors=True)
    return Response(status_code=204)


def copy_palace(db: Session, source: Palace, owner: User) -> Palace:
    """A copy with the same rooms and stops (positions and names), but no facts yet.
    Files are hard-linked, so a 95 MB scan isn't duplicated per user."""
    copy = Palace(user_id=owner.id, title=source.title, copied_from=source.id)
    db.add(copy)
    db.flush()
    src_dir, dst_dir = palace_dir(source.id), palace_dir(copy.id)
    room_ids = {}
    for room in source.rooms:
        link_or_copy(src_dir / room.file, dst_dir / room.file)
        new = Room(palace_id=copy.id, position=room.position, name=room.name, type=room.type,
                   file=room.file, flipped=room.flipped)
        db.add(new)
        db.flush()
        room_ids[room.id] = new.id
    for i, stop in enumerate(studio_stops(source)):
        if stop.crop and (src_dir / stop.crop).exists():
            link_or_copy(src_dir / stop.crop, dst_dir / stop.crop)
        db.add(PalaceStop(palace_id=copy.id, room_id=room_ids[stop.room_id], stop_order=i + 1,
                          direction=stop.direction, point=stop.point, view_from=stop.view_from,
                          label=stop.label, crop=stop.crop))
    db.commit()
    return copy


@router.post("/palaces/{palace_id}/copy", status_code=201)
def copy_route(palace_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Start your own palace from a shared one (e.g. the built-in Reitz route)."""
    copy = copy_palace(db, load_palace(db, palace_id, user), user)
    return palace_json(load_palace(db, copy.id, user), user)


# ---------- rooms: panoramas, photos and 3D scans ----------

@router.post("/palaces/{palace_id}/rooms", status_code=201)
def upload_rooms(palace_id: int, room: list[UploadFile] = File(...),
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    palace = load_palace(db, palace_id, user, write=True)
    if len(room) > 10:
        raise HTTPException(400, "Up to 10 rooms at a time")
    for upload in room:
        ext = Path(upload.filename or "").suffix.lower()
        splat = ext in SPLAT_EXTENSIONS
        if not splat and upload.content_type not in IMAGE_TYPES:
            raise HTTPException(400, "Upload a JPEG/PNG/WebP panorama or photo, or a .ply/.spz/.splat scan")
        name = new_name("room", ext if splat else IMAGE_TYPES[upload.content_type])
        path = palace_dir(palace.id) / name
        with path.open("wb") as out:
            shutil.copyfileobj(upload.file, out, length=1024 * 1024)
        if path.stat().st_size > 500 * 1024 * 1024:  # scans can be big, but not that big
            path.unlink()
            raise HTTPException(400, "That file is too big (500 MB max)")
        kind = "splat"
        if not splat:
            # 360° photos are 2:1 and phone panoramas wider; anything narrower is a regular photo.
            with path.open("rb") as f:
                size = image_size(f.read(256 * 1024))
            kind = "photo" if size and size[0] / size[1] < 1.9 else "panorama"
        db.add(Room(palace_id=palace.id, position=len(palace.rooms), name=f"Room {len(palace.rooms) + 1}",
                    type=kind, file=name, flipped=splat))  # most scan exports come in upside down
        db.flush()
        db.refresh(palace)
    return reload(db, palace, user)


class RoomPatch(BaseModel):
    name: str | None = None
    flipped: bool | None = None


@router.patch("/palaces/{palace_id}/rooms/{room_id}")
def update_room(palace_id: int, room_id: int, body: RoomPatch,
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    palace = load_palace(db, palace_id, user, write=True)
    room = next((r for r in palace.rooms if r.id == room_id), None)
    if room is None:
        raise HTTPException(404, "Room not found")
    if body.name is not None:
        room.name = body.name.strip()[:40] or room.name
    if body.flipped is not None:
        room.flipped = body.flipped
    return reload(db, palace, user)


@router.put("/palaces/{palace_id}/rooms/order")
def reorder_rooms(palace_id: int, body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Reorder the rooms. Body: {ids: [roomId, ...]} in the new order. The walk goes room by room,
    so the stops are renumbered to follow (keeping their order within each room)."""
    palace = load_palace(db, palace_id, user, write=True)
    by_id = {r.id: r for r in palace.rooms}
    ids = body.get("ids") or []
    if len(ids) != len(by_id) or set(ids) != set(by_id):
        raise HTTPException(400, "Order must list every room exactly once")
    for position, room_id in enumerate(ids):
        by_id[room_id].position = position
    place = {room_id: i for i, room_id in enumerate(ids)}
    set_order(db, sorted(studio_stops(palace), key=lambda s: (place[s.room_id], s.stop_order)))
    return reload(db, palace, user)


@router.delete("/palaces/{palace_id}/rooms/{room_id}")
def delete_room(palace_id: int, room_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    palace = load_palace(db, palace_id, user, write=True)
    room = next((r for r in palace.rooms if r.id == room_id), None)
    if room is None:
        raise HTTPException(404, "Room not found")
    for stop in [s for s in palace.stops if s.room_id == room_id]:
        db.delete(stop)
    db.delete(room)
    db.flush()
    set_order(db, [s for s in studio_stops(palace) if s.room_id != room_id])
    (palace_dir(palace.id) / room.file).unlink(missing_ok=True)
    return reload(db, palace, user)


# ---------- spots: the numbered stops on the walking path ----------

@router.post("/palaces/{palace_id}/spots", status_code=201)
def add_spot(palace_id: int, body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    palace = load_palace(db, palace_id, user, write=True)
    if not any(r.id == body.get("roomId") for r in palace.rooms):
        raise HTTPException(404, "Room not found")
    position = read_position(body)
    if not position:
        raise HTTPException(400, "A spot needs a direction (panorama) or point + viewFrom (scan)")
    stop = PalaceStop(palace_id=palace.id, room_id=body["roomId"], stop_order=len(studio_stops(palace)) + 1,
                      crop=save_crop(palace.id, body.get("crop")), **position)
    db.add(stop)
    db.commit()
    return spot_json(stop)


@router.put("/palaces/{palace_id}/spots/order")
def reorder_spots(palace_id: int, body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Reorder the walking path. Body: {ids: [spotId, ...]} in the new order."""
    palace = load_palace(db, palace_id, user, write=True)
    by_id = {s.id: s for s in studio_stops(palace)}
    ids = body.get("ids") or []
    if len(ids) != len(by_id) or set(ids) != set(by_id):
        raise HTTPException(400, "Order must list every spot exactly once")
    set_order(db, [by_id[i] for i in ids])
    return reload(db, palace, user)


@router.post("/palaces/{palace_id}/spots/{spot_id}/label", dependencies=[Depends(quota("label"))])
def label_spot(palace_id: int, spot_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Gemini names what was clicked ("desk lamp"). Called right after placing, so the egg appears
    instantly and the name fills in a few seconds later."""
    palace = load_palace(db, palace_id, user, write=True)
    stop = load_stop(palace, spot_id)
    if stop.label or not stop.crop:
        return spot_json(stop)
    label = gemini.label_spot((palace_dir(palace.id) / stop.crop).read_bytes())
    db.refresh(stop)
    stop.label = stop.label or label  # keep a name the user typed while we were waiting
    db.commit()
    return spot_json(stop)


@router.patch("/palaces/{palace_id}/spots/{spot_id}")
def update_spot(palace_id: int, spot_id: int, body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Rename a spot ({label}), or move it ({direction} or {point, viewFrom}, plus a new crop).
    A moved spot is on a new object: it loses its old name and picture, and counts as placed by the user."""
    palace = load_palace(db, palace_id, user, write=True)
    stop = load_stop(palace, spot_id)
    if "label" in body:
        stop.label = str(body.get("label") or "").strip()[:40] or None
    position = read_position(body)
    if position:
        for key, value in position.items():
            setattr(stop, key, value)
        stop.crop = save_crop(palace.id, body.get("crop"))
        stop.label = None
        stop.image = None
        stop.auto = False
    db.commit()
    return spot_json(stop)


def key_terms_of(text: str) -> list[str]:
    """Rough key terms for a hand-written idea: its numbers and longest words."""
    words = list(dict.fromkeys(re.findall(r"\d[\d.,:]*|[A-Za-z][\w'-]{5,}", text)))
    return sorted(words, key=lambda w: (not any(c.isdigit() for c in w), -len(w)))[:3]


class IdeaIn(BaseModel):
    fact: str


@router.put("/palaces/{palace_id}/spots/{spot_id}/idea", dependencies=[Depends(quota("scene"))])
def edit_idea(palace_id: int, spot_id: int, body: IdeaIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Fix the idea a stop holds (Gemini can get things wrong). The scene is rewritten to match."""
    fact = body.fact.strip()
    if not fact:
        raise HTTPException(400, "Write the idea first")
    if len(fact) > CAPS["ideaChars"]:
        raise HTTPException(400, f"Keep one idea under {CAPS['ideaChars']} characters")
    palace = load_palace(db, palace_id, user, write=True)
    stop = load_stop(palace, spot_id)
    number = studio_stops(palace).index(stop) + 1
    idea = {"text": fact, "kind": stop.kind or "fact", "keyTerms": key_terms_of(fact)}
    [item] = gemini.write_scenes([idea], [stop.label or f"spot {number}"], palace.flavor or "wild")
    stop.concept, stop.key_terms = fact, idea["keyTerms"]
    stop.association, stop.hook, stop.image_prompt = item["scene"], item["hook"], item["imagePrompt"]
    stop.image, stop.weirdness = None, 0
    db.commit()
    return spot_json(stop)


@router.delete("/palaces/{palace_id}/spots/{spot_id}")
def delete_spot(palace_id: int, spot_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    palace = load_palace(db, palace_id, user, write=True)
    stop = load_stop(palace, spot_id)
    db.delete(stop)
    db.flush()
    set_order(db, [s for s in studio_stops(palace) if s.id != spot_id])
    return reload(db, palace, user)


# ---------- fill, pictures, quiz ----------

class FillIn(BaseModel):
    notes: str = ""
    style: str = "storybook"
    flavor: str = "wild"


@router.post("/palaces/{palace_id}/fill", dependencies=[Depends(quota("fill"))])
def fill(palace_id: int, body: FillIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Notes -> the whole palace (see fill.py)."""
    notes = body.notes.strip()
    if not notes:
        raise HTTPException(400, "Paste some notes first")
    if len(notes) > CAPS["notesChars"]:
        raise HTTPException(400, f"Notes are capped at {CAPS['notesChars']:,} characters. Split them into two palaces.")
    style = body.style if body.style in gemini.PICTURE_STYLES else "storybook"
    flavor = body.flavor if body.flavor in gemini.FLAVORS else "wild"
    palace = load_palace(db, palace_id, user, write=True)
    fill_palace(db, palace, notes, style, flavor)
    return reload(db, palace, user)


def _draw(db: Session, palace: Palace, stops: list[PalaceStop]) -> list[dict]:
    """Draw pictures for these stops (doodles: a few per Gemini call). A stand-in sketch (Gemini was
    busy) is shown but not saved, so the real picture is tried again next time. Only call this for
    palaces the user may change (shared palaces come with their pictures)."""
    stops = [s for s in stops if s.image_prompt and not s.image]
    style = palace.style or "storybook"
    if gemini.PICTURES == "doodle":
        names = gemini.generate_doodles([s.image_prompt for s in stops], style)
        drawn = [(s, n, True) if n else (s, gemini._placeholder(s.image_prompt, style), False) for s, n in zip(stops, names)]
    else:
        drawn = []
        for s in stops:
            crop_path = palace_dir(palace.id) / s.crop if s.crop else None
            crop = crop_path.read_bytes() if crop_path and crop_path.exists() else None
            drawn.append((s, *gemini.generate_image(s.image_prompt, crop, style)))
    out = []
    for stop, name, final in drawn:
        if final:
            stop.image = name
        out.append({**spot_json(stop), "image": name, "imageFinal": final})
    db.commit()
    return out


class PicturesIn(BaseModel):
    ids: list[int] = Field(max_length=8)


@router.post("/palaces/{palace_id}/pictures", dependencies=[Depends(quota("picture"))])
def draw_pictures(palace_id: int, body: PicturesIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Pictures for a few stops at once (the next friends on your walk). One request, few Gemini calls."""
    palace = load_palace(db, palace_id, user)
    stops = [load_stop(palace, i) for i in body.ids]
    if not can_write(palace, user):
        return [spot_json(s) for s in stops]
    return _draw(db, palace, stops)


@router.post("/palaces/{palace_id}/spots/{spot_id}/image", dependencies=[Depends(quota("picture"))])
def draw_picture(palace_id: int, spot_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """One stop's picture (same as /pictures with one id)."""
    palace = load_palace(db, palace_id, user)
    stop = load_stop(palace, spot_id)
    if not stop.image_prompt:
        raise HTTPException(400, "This spot has no scene yet")
    if not can_write(palace, user):
        return spot_json(stop)
    return _draw(db, palace, [stop])[0] if not stop.image else spot_json(stop)


class ResultIn(BaseModel):
    correct: bool


@router.post("/palaces/{palace_id}/spots/{spot_id}/result")
def record_result(palace_id: int, spot_id: int, body: ResultIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Quiz answers are checked in the browser (instantly); this just keeps score."""
    palace = load_palace(db, palace_id, user, write=True)
    stop = load_stop(palace, spot_id)
    if not body.correct:
        stop.misses += 1
    db.commit()
    return spot_json(stop)


class ReviewIn(BaseModel):
    score: int = Field(ge=0)
    total: int = Field(ge=1)


@router.post("/palaces/{palace_id}/reviews")
def add_review(palace_id: int, body: ReviewIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """A finished quiz sets the next walk: 1, 3, 7, 21, 60 days while you score 80%+,
    otherwise again in 10 minutes. Saved as a quiz attempt (Thomas's table)."""
    palace = load_palace(db, palace_id, user, write=True)
    score = min(body.score, body.total)
    db.add(QuizAttempt(palace_id=palace.id, user_id=user.id, score=score, total=body.total))
    db.flush()
    db.refresh(palace)
    streak = 0
    for attempt in sorted(palace.attempts, key=lambda a: (a.taken_at or datetime.min.replace(tzinfo=timezone.utc), a.id), reverse=True):
        if attempt.score / attempt.total < 0.8:
            break
        streak += 1
    wait = timedelta(days=REVIEW_DAYS[min(streak, len(REVIEW_DAYS)) - 1]) if streak else timedelta(minutes=10)
    palace.next_review_at = datetime.now(timezone.utc) + wait
    db.commit()
    return {"nextReviewAt": palace.next_review_at.isoformat(),
            "reviews": [{"at": a.taken_at and a.taken_at.isoformat(), "score": a.score, "total": a.total} for a in palace.attempts]}


class WeirderIn(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=40)


@router.post("/palaces/{palace_id}/weirder", dependencies=[Depends(quota("scene"))])
def weirder_many(palace_id: int, body: WeirderIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """End of a quiz: every missed stop gets a new, weirder scene, all in one Gemini call."""
    palace = load_palace(db, palace_id, user, write=True)
    path = studio_stops(palace)
    stops = [s for s in (load_stop(palace, i) for i in body.ids) if s.concept]
    asks = [{"fact": s.concept, "label": s.label or f"spot {path.index(s) + 1}", "scene": s.association or "",
             "level": min(5, s.weirdness + 1), "kind": s.kind or "fact"} for s in stops]
    for stop, ask, result in zip(stops, asks, gemini.weirder_scenes(asks, palace.flavor or "wild")):
        if result:
            stop.association, stop.hook, stop.image_prompt = result["scene"], result["hook"], result["imagePrompt"]
            stop.image, stop.weirdness = None, ask["level"]
    db.commit()
    return [spot_json(s) for s in stops]


@router.post("/palaces/{palace_id}/spots/{spot_id}/weirder", dependencies=[Depends(quota("scene"))])
def weirder(palace_id: int, spot_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """A missed spot gets a new, weirder scene. Its picture is redrawn when you wander past."""
    palace = load_palace(db, palace_id, user, write=True)
    stop = load_stop(palace, spot_id)
    if not stop.concept:
        raise HTTPException(400, "This spot has no fact")
    level = min(5, stop.weirdness + 1)
    number = studio_stops(palace).index(stop) + 1
    result = gemini.weirder_scene(stop.concept, stop.label or f"spot {number}", stop.association or "", level,
                                  stop.kind or "fact", palace.flavor or "wild")
    stop.association, stop.hook, stop.image_prompt = result["scene"], result["hook"], result["imagePrompt"]
    stop.image, stop.weirdness = None, level
    db.commit()
    return spot_json(stop)
