"""'Never pay twice': every Gemini result is saved to data/cache/ under a hash of its inputs
(model + prompt + reference image). Same inputs -> read from disk, no API call.

If two requests ask for the same thing at the same moment, they share one API call."""
import hashlib
import json
import threading
from concurrent.futures import Future

from app.studio.files import CACHE_DIR

_lock = threading.Lock()
_in_flight: dict[str, Future] = {}


def _hash(parts) -> str:
    # Same as JSON.stringify in the old Node server, so its cache files still match.
    text = json.dumps(parts, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(text.encode()).hexdigest()[:24]


def _once(key: str, produce):
    with _lock:
        future = _in_flight.get(key)
        owner = future is None
        if owner:
            future = _in_flight[key] = Future()
    if not owner:
        return future.result()
    try:
        value = produce()
        future.set_result(value)
        return value
    except BaseException as err:
        future.set_exception(err)
        raise
    finally:
        with _lock:
            _in_flight.pop(key, None)


def cached_json(parts, produce):
    path = CACHE_DIR / f"{_hash(parts)}.json"

    def run():
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        value = produce()
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        return value

    return _once(str(path), run)


def cached_image(parts, produce) -> str:
    """produce() returns (bytes, ext). Returns the file name, served at /cache/<name>."""
    base = _hash(parts)

    def run():
        existing = next(CACHE_DIR.glob(f"{base}.*"), None)
        if existing:
            return existing.name
        data, ext = produce()
        name = f"{base}.{ext}"
        (CACHE_DIR / name).write_bytes(data)
        return name

    return _once(base, run)
