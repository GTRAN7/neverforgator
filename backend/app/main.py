"""The FastAPI app: creates the server and plugs in every group of routes.

Run from the backend/ folder:
    fastapi dev main.py
Then open http://localhost:8000/docs to try every endpoint in the browser.
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.routers import locations, palaces, users

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
