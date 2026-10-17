"""The NeverForgator studio API (/api/...). Runs in mock-AI mode (no Gemini calls, see conftest.py)."""
import struct
import zlib

from app.models import Palace, User
from app.studio import limits
from tests.conftest import as_user


def png(width: int, height: int) -> bytes:
    """A tiny valid PNG of the given size (one gray pixel stretched; only the header matters here)."""
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    raw = b"".join(b"\x00" + b"\x80" * width for _ in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def new_palace(client, user="alice", rooms=(png(400, 100),)):
    palace = client.post("/api/palaces", json={"name": "Dorm"}, headers=as_user(user)).json()
    files = [("room", (f"room{i}.png", data, "image/png")) for i, data in enumerate(rooms)]
    return client.post(f"/api/palaces/{palace['id']}/rooms", files=files, headers=as_user(user)).json()


def test_status_is_public(client):
    body = client.get("/api/status").json()
    assert body["mock"] is True and body["caps"]["notesChars"] == 20_000


def test_studio_needs_login(client, monkeypatch):
    from app import config
    monkeypatch.setattr(config, "DEV_AUTH", False)
    assert client.get("/api/palaces").status_code == 401


def test_rooms_are_panoramas_or_photos_by_shape(client):
    palace = new_palace(client, rooms=(png(400, 100), png(300, 200)))
    assert [r["type"] for r in palace["rooms"]] == ["panorama", "photo"]


def test_fill_builds_the_whole_palace(client):
    palace = new_palace(client)
    notes = "Mitochondria make ATP for the cell. The nucleus stores the DNA. Ribosomes build proteins."
    filled = client.post(f"/api/palaces/{palace['id']}/fill", json={"notes": notes}, headers=as_user("alice")).json()
    # One idea per stop; stops found in the panorama automatically.
    assert filled["fillReport"]["ideas"] == 3
    assert [s["fact"] for s in filled["spots"]] == [
        "Mitochondria make ATP for the cell.", "The nucleus stores the DNA.", "Ribosomes build proteins."]
    assert all(s["auto"] and s["scene"] and s["direction"] for s in filled["spots"])
    assert filled["nextReviewAt"]


def test_fill_rejects_huge_notes(client):
    palace = new_palace(client)
    r = client.post(f"/api/palaces/{palace['id']}/fill", json={"notes": "x" * 20_001}, headers=as_user("alice"))
    assert r.status_code == 400


def test_spots_place_move_reorder_delete(client):
    palace = new_palace(client)
    pid, room = palace["id"], palace["rooms"][0]["id"]
    a = client.post(f"/api/palaces/{pid}/spots", json={"roomId": room, "direction": [1, 0, 0]}, headers=as_user("alice")).json()
    b = client.post(f"/api/palaces/{pid}/spots", json={"roomId": room, "direction": [0, 0, 1]}, headers=as_user("alice")).json()
    moved = client.patch(f"/api/palaces/{pid}/spots/{a['id']}", json={"direction": [0, 1, 0]}, headers=as_user("alice")).json()
    assert moved["direction"] == [0, 1, 0]
    order = client.put(f"/api/palaces/{pid}/spots/order", json={"ids": [b["id"], a["id"]]}, headers=as_user("alice")).json()
    assert [s["id"] for s in order["spots"]] == [b["id"], a["id"]]
    left = client.delete(f"/api/palaces/{pid}/spots/{b['id']}", headers=as_user("alice")).json()
    assert [s["id"] for s in left["spots"]] == [a["id"]]


def test_other_peoples_palaces_are_hidden(client):
    palace = new_palace(client)
    assert client.get(f"/api/palaces/{palace['id']}", headers=as_user("bob")).status_code == 404


def test_shared_palaces_can_be_copied_not_changed(client, session_factory):
    palace = new_palace(client)
    with session_factory() as db:
        db.get(Palace, palace["id"]).template = True
        db.commit()
    seen = client.get(f"/api/palaces/{palace['id']}", headers=as_user("bob")).json()
    assert seen["readOnly"] is True
    r = client.post(f"/api/palaces/{palace['id']}/fill", json={"notes": "A fact here."}, headers=as_user("bob"))
    assert r.status_code == 403
    copy = client.post(f"/api/palaces/{palace['id']}/copy", headers=as_user("bob")).json()
    assert copy["readOnly"] is False and len(copy["rooms"]) == 1


def test_review_schedule_stretches_with_good_scores(client):
    palace = new_palace(client)
    url = f"/api/palaces/{palace['id']}/reviews"
    weak = client.post(url, json={"score": 1, "total": 5}, headers=as_user("alice")).json()
    good = client.post(url, json={"score": 5, "total": 5}, headers=as_user("alice")).json()
    assert weak["nextReviewAt"] < good["nextReviewAt"]
    # Saved as quiz attempts, so Thomas's /palaces/{id}/attempts sees them too.
    assert len(client.get(f"/palaces/{palace['id']}/attempts", headers=as_user("alice")).json()) == 2


def test_daily_quota(client, monkeypatch):
    monkeypatch.setitem(limits.DAILY, "label", (1, "stop names"))
    palace = new_palace(client)
    pid, room = palace["id"], palace["rooms"][0]["id"]
    spot = client.post(f"/api/palaces/{pid}/spots", json={"roomId": room, "direction": [1, 0, 0]}, headers=as_user("alice")).json()
    url = f"/api/palaces/{pid}/spots/{spot['id']}/label"
    assert client.post(url, headers=as_user("alice")).status_code == 200
    assert client.post(url, headers=as_user("alice")).status_code == 429


def test_delete_palace(client, session_factory):
    palace = new_palace(client)
    assert client.delete(f"/api/palaces/{palace['id']}", headers=as_user("alice")).status_code == 204
    with session_factory() as db:
        assert db.get(Palace, palace["id"]) is None
        assert db.query(User).filter_by(auth0_sub="dev|alice").one()


def test_describe_is_public(client):
    r = client.post("/api/describe", json={"kind": "term", "text": "allele"})
    assert r.status_code == 200 and r.json()["description"]


def test_pictures_and_weirder_in_batches(client):
    palace = new_palace(client)
    filled = client.post(f"/api/palaces/{palace['id']}/fill", json={"notes": "Mitochondria make ATP. The nucleus stores DNA."},
                         headers=as_user("alice")).json()
    ids = [s["id"] for s in filled["spots"]]
    drawn = client.post(f"/api/palaces/{palace['id']}/pictures", json={"ids": ids}, headers=as_user("alice")).json()
    assert len(drawn) == 2 and all(s["image"] for s in drawn)
    rewritten = client.post(f"/api/palaces/{palace['id']}/weirder", json={"ids": ids}, headers=as_user("alice")).json()
    assert all(s["weirdness"] == 1 and s["image"] is None for s in rewritten)
