"""Palaces remember their place ("my dorm room"); the title becomes the topic stored there.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-17

Existing palaces were named after their place, so the place starts as a copy of the title, and
palaces that already hold notes are renamed after the first line of their notes (their topic).
"""
import re
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("palaces", sa.Column("place", sa.String(length=80), nullable=True))  # no table rebuild
    op.execute("UPDATE palaces SET place = title WHERE place IS NULL")
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, source_text FROM palaces WHERE source_text IS NOT NULL")).fetchall()
    for palace_id, notes in rows:
        line = next((l.strip() for l in notes.splitlines() if l.strip()), "")
        topic = re.sub(r"[:.\s]+$", "", line)[:80]
        if topic:
            bind.execute(sa.text("UPDATE palaces SET title = :t WHERE id = :i AND title = place"), {"t": topic, "i": palace_id})


def downgrade() -> None:
    with op.batch_alter_table("palaces", schema=None) as batch_op:
        batch_op.drop_column("place")
