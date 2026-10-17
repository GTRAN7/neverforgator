"""Shared test setup: a fresh throwaway SQLite database for every test.

Run all tests from the backend/ folder with:   pytest
"""
import os

# Settings must be in place BEFORE the app is imported.
os.environ["DATABASE_URL"] = "sqlite:///./test_loci.db"
os.environ["DEV_AUTH"] = "true"
os.environ["AUTH0_DOMAIN"] = "test-tenant.us.auth0.com"
os.environ["AUTH0_AUDIENCE"] = "https://loci-api"
os.environ["GEMINI_API_KEY"] = ""  # tests never call Gemini (mock AI mode)
os.environ["DATA_DIR"] = "./test_data"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app import config
from app.db import get_db
from app.main import app
from app.models import Base
from app.seed import seed_locations


@pytest.fixture()
def session_factory(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False}
    )

    @event.listens_for(engine, "connect")
    def _fk_on(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        seed_locations(db)
    yield factory
    engine.dispose()


@pytest.fixture()
def client(session_factory, monkeypatch):
    monkeypatch.setattr(config, "DEV_AUTH", True)

    def _get_test_db():
        with session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = _get_test_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def as_user(name: str) -> dict:
    """Headers that make a request act as a given (fake, dev-mode) user."""
    return {"X-Dev-User": name}


SAMPLE_PALACE = {
    "title": "Bio 101: Cells",
    "source_text": "Mitochondria make ATP. Ribosomes build proteins.",
    "stops": [
        {
            "concept": "Mitochondria",
            "association": "A giant condor pedals a generator on top of Library West",
            "questions": [
                {"question": "What do mitochondria produce?", "answer": "ATP"},
                {
                    "question": "Where did you put mitochondria?",
                    "answer": "Library West",
                    "type": "multiple_choice",
                    "choices": ["Library West", "Reitz Union", "Lake Alice"],
                },
            ],
        },
        {
            "concept": "Ribosome",
            "association": "Robots assembling protein bars in Smathers Library",
            "questions": [{"question": "What do ribosomes build?", "answer": "Proteins"}],
        },
    ],
}
