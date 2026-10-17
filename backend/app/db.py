"""Database connection.

`engine` is the connection to the database. `get_db` hands each request its own
session (a "conversation" with the database) and closes it when the request ends.
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.config import DATABASE_URL, DB_CONNECT_ARGS

is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    # SQLite: let FastAPI's worker threads share the connection.
    # Postgres: turn on SSL (see config.py).
    connect_args={"check_same_thread": False} if is_sqlite else DB_CONNECT_ARGS,
    # Neon closes idle connections; this checks a connection is alive before using it.
    pool_pre_ping=True,
)

if is_sqlite:
    # SQLite ignores foreign keys (and ON DELETE CASCADE) unless you turn them on.
    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db():
    """FastAPI dependency: one database session per request."""
    with SessionLocal() as db:
        yield db
