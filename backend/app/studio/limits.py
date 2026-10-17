"""Fair-use limits, so one user (or a stuck script) can't burn the whole Gemini budget.

- Size caps: how much text / how big a file one request may send.
- Daily quotas per user and action, e.g. 10 note scans a day (table usage_counts, reset daily, UTC).
- A burst limit: at most 120 studio API calls a minute per user (in memory, per server).
"""
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import UsageCount, User

CAPS = {
    "notesChars": 20_000,  # ≈ 5,000 tokens: a long textbook chapter
    "ideaChars": 300,  # one idea, edited by hand
    "importBytes": 20 * 1024 * 1024,  # Gemini takes up to 20 MB inline
}

DAILY = {
    "fill": (20, "palace fills"),
    "import": (10, "note scans and recordings"),
    "scene": (60, "rewritten scenes"),
    "label": (200, "stop names"),
    "picture": (150, "pictures"),
}


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def usage_for(db: Session, user: User) -> dict:
    """What's left today, for the UI: {"fill": {"used", "limit", "label"}, ...}"""
    rows = {r.action: r.count for r in db.query(UsageCount).filter_by(user_id=user.id, day=_today())}
    return {action: {"used": rows.get(action, 0), "limit": limit, "label": label}
            for action, (limit, label) in DAILY.items()}


def quota(action: str):
    """Route dependency: counts one use of `action`, or answers 429 when today's quota is gone.
    A request that fails with 400 or on our side (5xx) gives the use back."""
    def dependency(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
        limit, label = DAILY[action]
        row = db.get(UsageCount, (user.id, _today(), action))
        if row is None:
            row = UsageCount(user_id=user.id, day=_today(), action=action, count=0)
            db.add(row)
        if row.count >= limit:
            raise HTTPException(429, f"Daily limit reached: {limit} {label} a day. It resets at midnight UTC.")
        row.count += 1
        db.commit()
        try:
            yield
        except Exception as err:
            if not isinstance(err, HTTPException) or err.status_code == 400 or err.status_code >= 500:
                db.rollback()
                row = db.get(UsageCount, (user.id, _today(), action))
                if row and row.count > 0:
                    row.count -= 1
                    db.commit()
            raise

    return dependency


_recent: dict[str, deque] = defaultdict(deque)


def burst_limit(request: Request, user: User = Depends(get_current_user)):
    """At most 120 studio API calls a minute per user."""
    _check_burst(f"user:{user.id}", 120)


def ip_limit(request: Request):
    """For the few public AI routes (no login): 20 calls a minute per address."""
    _check_burst(f"ip:{request.client.host if request.client else '?'}", 20)


def _check_burst(key: str, per_minute: int):
    now = time.monotonic()
    times = _recent[key]
    while times and now - times[0] > 60:
        times.popleft()
    if len(times) >= per_minute:
        raise HTTPException(429, "Slow down a little: too many requests this minute.")
    times.append(now)
