"""Create all tables.

Revision ID: 0001
Revises:
Create Date: 2026-10-17

Rule: never edit this file after it has run on the shared database.
To change the schema, edit app/models.py and make a NEW migration:
    alembic revision --autogenerate -m "describe the change"
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("auth0_sub", sa.String(255), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_users_auth0_sub", "users", ["auth0_sub"], unique=True)

    op.create_table(
        "locations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False, unique=True),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("route_order", sa.Integer(), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
    )

    op.create_table(
        "palaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_palaces_user_id", "palaces", ["user_id"])

    op.create_table(
        "palace_stops",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "palace_id", sa.Integer(), sa.ForeignKey("palaces.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("location_id", sa.Integer(), sa.ForeignKey("locations.id"), nullable=False),
        sa.Column("stop_order", sa.Integer(), nullable=False),
        sa.Column("concept", sa.String(300), nullable=False),
        sa.Column("association", sa.Text(), nullable=False),
        sa.UniqueConstraint("palace_id", "stop_order", name="uq_palace_stop_order"),
    )
    op.create_index("ix_palace_stops_palace_id", "palace_stops", ["palace_id"])

    op.create_table(
        "quiz_questions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "stop_id", sa.Integer(), sa.ForeignKey("palace_stops.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("choices", sa.JSON(), nullable=True),
        sa.CheckConstraint(
            "type IN ('multiple_choice', 'short_answer')", name="ck_question_type"
        ),
    )
    op.create_index("ix_quiz_questions_stop_id", "quiz_questions", ["stop_id"])

    op.create_table(
        "quiz_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "palace_id", sa.Integer(), sa.ForeignKey("palaces.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column(
            "taken_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("score >= 0 AND score <= total", name="ck_attempt_score"),
    )
    op.create_index("ix_quiz_attempts_palace_id", "quiz_attempts", ["palace_id"])


def downgrade() -> None:
    # Drop in reverse order so foreign keys don't block anything.
    op.drop_table("quiz_attempts")
    op.drop_table("quiz_questions")
    op.drop_table("palace_stops")
    op.drop_table("palaces")
    op.drop_table("locations")
    op.drop_index("ix_users_auth0_sub", table_name="users")
    op.drop_table("users")
