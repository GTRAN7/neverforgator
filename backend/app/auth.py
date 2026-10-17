"""Who is making this request?

The React app logs in with Auth0 and gets an *access token* (a signed JWT).
It sends that token on every API call in the header:

    Authorization: Bearer <token>

We check the token's signature against Auth0's public keys, so we know Auth0
issued it and nobody edited it. Then we read the user's Auth0 ID (the "sub"
claim) and find or create their row in the users table.

We never see or store passwords. Auth0 handles all of that.
"""
import logging
import time

import httpx
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import config
from app.db import get_db
from app.models import User

log = logging.getLogger("loci.auth")

bearer_scheme = HTTPBearer(auto_error=False)

# Auth0's public signing keys ("JWKS"), downloaded once and reused for an hour.
_jwks_cache: dict = {"keys": None, "fetched_at": 0.0}
JWKS_CACHE_SECONDS = 3600


def _get_jwks(force_refresh: bool = False) -> dict:
    """Auth0 publishes its public signing keys at this URL. We download them once
    and cache them, so we don't fetch them on every request."""
    stale = time.time() - _jwks_cache["fetched_at"] > JWKS_CACHE_SECONDS
    if force_refresh or stale or _jwks_cache["keys"] is None:
        r = httpx.get(f"{config.AUTH0_ISSUER}.well-known/jwks.json", timeout=5)
        r.raise_for_status()
        _jwks_cache["keys"] = r.json()
        _jwks_cache["fetched_at"] = time.time()
    return _jwks_cache["keys"]


def _signing_keys_for(token: str) -> dict:
    """Return Auth0's key set, refreshing it once if the token uses a key we
    haven't seen (Auth0 occasionally rotates keys)."""
    kid = jwt.get_unverified_header(token).get("kid")
    jwks = _get_jwks()
    if kid and not any(k.get("kid") == kid for k in jwks.get("keys", [])):
        jwks = _get_jwks(force_refresh=True)
    return jwks


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_token(token: str) -> dict:
    """Check the token is genuine and meant for this API. Returns its claims."""
    if not config.AUTH0_DOMAIN or not config.AUTH0_AUDIENCE:
        raise HTTPException(500, "Server is missing AUTH0_DOMAIN or AUTH0_AUDIENCE")
    try:
        claims = jwt.decode(
            token,
            _signing_keys_for(token),
            algorithms=["RS256"],            # only accept Auth0's signing algorithm
            audience=config.AUTH0_AUDIENCE,  # token must be meant for THIS API
            issuer=config.AUTH0_ISSUER,      # token must come from OUR Auth0 tenant
            # leeway: a laptop clock a little off shouldn't make a fresh token look expired.
            options={"require_exp": True, "require_sub": True, "leeway": 30},
        )
    except ExpiredSignatureError:
        raise _unauthorized("Token expired")
    except (JWTError, httpx.HTTPError) as e:
        # Covers bad signatures, wrong audience/issuer, garbage tokens,
        # and failures to download Auth0's keys.
        log.info("Rejected token: %s", e)
        raise _unauthorized("Invalid token")
    if not claims.get("sub") or "exp" not in claims:
        raise _unauthorized("Invalid token")
    return claims


def _fetch_profile(token: str) -> dict:
    """Access tokens don't include email/name, so ask Auth0 once, when the user
    is first created. If it fails we still create the user, just without email."""
    try:
        r = httpx.get(
            f"{config.AUTH0_ISSUER}userinfo",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
        if r.status_code == 200:
            return r.json()
    except httpx.HTTPError:
        pass
    return {}


def _find_or_create_user(db: Session, sub: str, profile_loader) -> User:
    user = db.scalars(select(User).where(User.auth0_sub == sub)).first()
    if user:
        return user

    profile = profile_loader()
    user = User(auth0_sub=sub, email=profile.get("email"), name=profile.get("name"))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two requests from a brand-new user arrived at the same moment and the
        # other one created the row first. Just use that row.
        db.rollback()
        user = db.scalars(select(User).where(User.auth0_sub == sub)).one()
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    x_dev_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency. Add `user: User = Depends(get_current_user)` to any
    route and it becomes login-only: no valid token, no access."""

    if config.DEV_AUTH:
        # Local development shortcut: pretend to be whoever the X-Dev-User header says.
        name = (x_dev_user or "tester").strip() or "tester"
        sub = f"dev|{name}"
        return _find_or_create_user(
            db, sub, lambda: {"email": f"{name}@example.com", "name": name}
        )

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("Missing bearer token")

    token = credentials.credentials
    claims = verify_token(token)
    return _find_or_create_user(db, claims["sub"], lambda: _fetch_profile(token))
