"""All settings come from environment variables (loaded from backend/.env).

Nothing secret is written in code. Copy .env.example to .env and fill it in.
"""
import os
import ssl
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv

load_dotenv()  # reads backend/.env if it exists


def _database_settings() -> tuple[str, dict]:
    """Returns (url, connect_args) for SQLAlchemy."""
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        # No Postgres configured yet: use a local SQLite file so you can start right away.
        return "sqlite:///./loci.db", {}
    if url.startswith("sqlite"):
        return url, {}

    # Neon and Render give URLs starting with postgres:// or postgresql://.
    # We use the pg8000 driver: pure Python, so it installs on any Python version.
    for prefix in ("postgresql+psycopg://", "postgresql+pg8000://", "postgresql://", "postgres://"):
        if url.startswith(prefix):
            url = "postgresql+pg8000://" + url[len(prefix):]
            break

    # pg8000 doesn't understand Neon's "?sslmode=require&channel_binding=require"
    # options, so remove them and turn on SSL (encryption) ourselves instead.
    parts = urlsplit(url)
    query = parse_qs(parts.query)
    sslmode = query.pop("sslmode", ["require"])[0]
    query.pop("channel_binding", None)
    url = urlunsplit(parts._replace(query=urlencode(query, doseq=True)))

    connect_args = {}
    if sslmode != "disable":
        connect_args["ssl_context"] = ssl.create_default_context()
    return url, connect_args


DATABASE_URL, DB_CONNECT_ARGS = _database_settings()

# Auth0. The domain is the tenant from frontend/.env.local; the audience is the
# "Identifier" of the API you create in Auth0 (Applications -> APIs).
AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "").strip()
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE", "").strip()
AUTH0_ISSUER = f"https://{AUTH0_DOMAIN}/" if AUTH0_DOMAIN else ""

# DEV_AUTH=true skips Auth0 and trusts an "X-Dev-User" header instead.
# Only for local development. NEVER turn this on in production.
DEV_AUTH = os.getenv("DEV_AUTH", "false").strip().lower() == "true"

# Which websites may call this API from a browser (comma-separated).
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

# ---- NeverForgator studio (Gemini + rooms) ----

# Gemini. Only the backend reads this key; it never reaches the browser.
# No key = "mock AI" mode: placeholder facts and scenes, so the app still runs offline.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
# Optional: pin models instead of picking the newest "flash" ones.
GEMINI_TEXT_MODEL = os.getenv("GEMINI_TEXT_MODEL", "").strip()
GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "").strip()
# How stops get pictures: doodle (Gemini draws a small SVG, free tier OK), gemini (real
# images, needs billing) or placeholder (free sketch cards, no API call).
PICTURES = os.getenv("PICTURES", "doodle").strip() or "doodle"

# Where uploaded rooms, stop crops and generated pictures live (gitignored).
DATA_DIR = os.path.abspath(os.getenv("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data")))
