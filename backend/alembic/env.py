"""Tells Alembic which database to use and what the tables should look like."""
from logging.config import fileConfig

from alembic import context

from app.config import DATABASE_URL
from app.db import engine
from app.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Lets `alembic revision --autogenerate` compare models.py to the real database.
target_metadata = Base.metadata

IS_SQLITE = DATABASE_URL.startswith("sqlite")


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=IS_SQLITE,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Reuse the app's engine so migrations connect exactly like the app does
    # (same driver, same SSL settings).
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite can't ALTER tables much; batch mode works around that.
            render_as_batch=IS_SQLITE,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
