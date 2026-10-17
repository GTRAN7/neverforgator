"""The FastAPI app: creates the server and plugs in every group of routes.

Run from the backend/ folder:
    fastapi dev main.py
Then open http://localhost:8000/docs to try every endpoint in the browser.
"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app import config
from app.routers import locations, palaces, users
from app.studio import gemini
from app.studio import router as studio
from app.studio.files import CACHE_DIR, PALACES_DIR
from app.studio.seed_samples import seed_if_missing

logging.basicConfig(level=logging.INFO)

if config.DEV_AUTH:
    logging.getLogger("loci").warning(
        "DEV_AUTH is ON: anyone can act as any user with the X-Dev-User header. "
        "Never deploy with DEV_AUTH=true."
    )

app = FastAPI(
    title="Loci API",
    description="Backend for the UF campus memory palace app (SwampHacks XII).",
    version="0.1.0",
)

# Let the React app (a different origin, e.g. http://localhost:5173) call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,  # we use bearer tokens, not cookies
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
def health():
    """Public check that the server is running."""
    return {"status": "ok"}


app.include_router(users.router)
app.include_router(locations.router)
app.include_router(palaces.router)

# ---- NeverForgator studio: palaces in rooms, filled by Gemini (app/studio/) ----
app.include_router(studio.public)
app.include_router(studio.router)

# Room photos/scans and stop crops: /files/<palaceId>/<file>. Generated pictures: /cache/<file>.
# Public (an <img> tag can't send a token); the names are random.
app.mount("/files", StaticFiles(directory=PALACES_DIR), name="files")
app.mount("/cache", StaticFiles(directory=CACHE_DIR), name="cache")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    # Uploaded and generated files (SVG doodles included) may never run scripts, even opened directly.
    if request.url.path.startswith(("/files/", "/cache/")):
        response.headers["Content-Security-Policy"] = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"
    return response


@app.exception_handler(gemini.GeminiError)
def gemini_failed(request: Request, err: gemini.GeminiError):
    """Gemini was down, busy or out of quota: say so instead of a bare 500."""
    return JSONResponse(status_code=502, content={"detail": str(err)})


gemini.choose_models()
seed_if_missing()  # the built-in Reitz route and the mitosis example (app/studio/seed_samples.py)
logging.getLogger("loci").info(
    "Gemini: %s", "MOCK mode (no GEMINI_API_KEY)" if gemini.MOCK
    else f"text={gemini.models['text']}, pictures={gemini.PICTURES}")
