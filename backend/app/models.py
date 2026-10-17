"""Database tables, written as Python classes (SQLAlchemy 2.0 style).

Each class is one table; each attribute is one column. `relationship(...)`
lines don't create columns, they let you write `palace.stops` in Python.

Tables:
  users           one row per Auth0 account
  locations       hand-picked UF campus landmarks (the fixed walking route)
  palaces         a memory palace a user created from their notes
  palace_stops    one concept placed at one location, in walking order
  quiz_questions  questions attached to a stop
  quiz_attempts   a user's quiz scores for a palace
"""
from datetime import datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Auth0's unique ID for this person, e.g. "auth0|65f..." or "google-oauth2|1234".
    auth0_sub: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(320))
    name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    palaces: Mapped[list["Palace"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    lat: Mapped[float]
    lng: Mapped[float]
    # Position along the walking route: 1 is the first stop, 2 the next, ...
    route_order: Mapped[int] = mapped_column(unique=True)
    description: Mapped[str | None] = mapped_column(Text)


class Palace(Base):
    __tablename__ = "palaces"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    source_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped[User] = relationship(back_populates="palaces")
    stops: Mapped[list["PalaceStop"]] = relationship(
        back_populates="palace",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="PalaceStop.stop_order",
    )
    attempts: Mapped[list["QuizAttempt"]] = relationship(
        back_populates="palace", cascade="all, delete-orphan", passive_deletes=True
    )


class PalaceStop(Base):
    __tablename__ = "palace_stops"
    # Two stops in the same palace can't share a position on the route.
    __table_args__ = (UniqueConstraint("palace_id", "stop_order", name="uq_palace_stop_order"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    palace_id: Mapped[int] = mapped_column(
        ForeignKey("palaces.id", ondelete="CASCADE"), index=True
    )
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    # Called stop_order, not "order": ORDER is a reserved word in SQL.
    stop_order: Mapped[int]
    concept: Mapped[str] = mapped_column(String(300))
    # The vivid image linking the concept to the place.
    association: Mapped[str] = mapped_column(Text)

    palace: Mapped[Palace] = relationship(back_populates="stops")
    location: Mapped[Location] = relationship()
    questions: Mapped[list["QuizQuestion"]] = relationship(
        back_populates="stop",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="QuizQuestion.id",
    )


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    __table_args__ = (
        CheckConstraint(
            "type IN ('multiple_choice', 'short_answer')", name="ck_question_type"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    stop_id: Mapped[int] = mapped_column(
        ForeignKey("palace_stops.id", ondelete="CASCADE"), index=True
    )
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(20))
    # Only for multiple-choice questions: the list of options. Null otherwise.
    choices: Mapped[list[str] | None] = mapped_column(JSON)

    stop: Mapped[PalaceStop] = relationship(back_populates="questions")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    __table_args__ = (
        CheckConstraint("score >= 0 AND score <= total", name="ck_attempt_score"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    palace_id: Mapped[int] = mapped_column(
        ForeignKey("palaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    score: Mapped[int]  # questions answered correctly
    total: Mapped[int]  # questions asked
    taken_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    palace: Mapped[Palace] = relationship(back_populates="attempts")
