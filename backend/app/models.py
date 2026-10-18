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
  rooms           the places a palace is built in: panoramas, photos or 3D scans (NeverForgator studio)
  usage_counts    how many AI actions each user used today (fair-use limits, see app/studio/limits.py)

A palace's stops sit either at a campus location (location_id, the fixed route) or at a spot
inside one of its rooms (room_id + a direction or 3D point). Studio palaces also keep the
scene, hook and picture for each stop.
"""
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
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
    # --- NeverForgator studio (palaces built in rooms) ---
    # The place it's built in ("my dorm room", "Reitz Union"). The title is the topic stored there.
    # Several palaces can share a place: "New topic here" copies its rooms and stops.
    place: Mapped[str | None] = mapped_column(String(80))
    style: Mapped[str | None] = mapped_column(String(20))   # picture style
    flavor: Mapped[str | None] = mapped_column(String(20))  # how weird scenes get
    # Shared palaces everyone can open and copy (the built-in Reitz route, the example).
    template: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    built_in: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    sample: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    copied_from: Mapped[int | None] = mapped_column(ForeignKey("palaces.id", ondelete="SET NULL"))
    fill_report: Mapped[dict | None] = mapped_column(JSON)  # how the last fill split the notes
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="palaces")
    rooms: Mapped[list["Room"]] = relationship(
        back_populates="palace",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Room.position",
    )
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
    # Campus route palaces: the location. Studio palaces: null (they use room_id instead).
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"))
    # Called stop_order, not "order": ORDER is a reserved word in SQL.
    stop_order: Mapped[int]
    # The idea stored here. Null while the stop is still an empty "egg".
    concept: Mapped[str | None] = mapped_column(String(300))
    # The vivid image linking the concept to the place (the "scene").
    association: Mapped[str | None] = mapped_column(Text)

    # --- NeverForgator studio: a spot inside a room ---
    room_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    direction: Mapped[list[float] | None] = mapped_column(JSON)  # panoramas/photos: where you look
    point: Mapped[list[float] | None] = mapped_column(JSON)      # 3D scans: the spot...
    view_from: Mapped[list[float] | None] = mapped_column(JSON)  # ...and where the camera stands
    label: Mapped[str | None] = mapped_column(String(80))        # "red armchair"
    crop: Mapped[str | None] = mapped_column(String(120))        # file name of what was clicked
    auto: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")  # found by Gemini
    kind: Mapped[str | None] = mapped_column(String(20))         # number, name, list, ...
    key_terms: Mapped[list[str] | None] = mapped_column(JSON)
    hook: Mapped[str | None] = mapped_column(Text)               # "allele → bowling alley"
    image_prompt: Mapped[str | None] = mapped_column(Text)
    image: Mapped[str | None] = mapped_column(String(120))       # file name in the picture cache
    weirdness: Mapped[int] = mapped_column(default=0, server_default="0")
    misses: Mapped[int] = mapped_column(default=0, server_default="0")

    palace: Mapped[Palace] = relationship(back_populates="stops")
    location: Mapped[Location | None] = relationship()
    room: Mapped["Room | None"] = relationship(back_populates="stops")
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


class Room(Base):
    """A place a studio palace is built in: a 360° or phone panorama, a flat photo, or a 3D scan.
    The file itself lives on disk in data/palaces/<palace_id>/."""
    __tablename__ = "rooms"
    __table_args__ = (
        CheckConstraint("type IN ('panorama', 'photo', 'splat')", name="ck_room_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    palace_id: Mapped[int] = mapped_column(ForeignKey("palaces.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(default=0)  # order in the room strip = order of the walk
    name: Mapped[str] = mapped_column(String(80))
    type: Mapped[str] = mapped_column(String(20))
    file: Mapped[str] = mapped_column(String(120))
    flipped: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")  # upside-down scans

    palace: Mapped[Palace] = relationship(back_populates="rooms")
    stops: Mapped[list[PalaceStop]] = relationship(back_populates="room", passive_deletes=True)


class UsageCount(Base):
    """How many times a user did an AI action on a given day (fair-use limits)."""
    __tablename__ = "usage_counts"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[str] = mapped_column(String(10), primary_key=True)  # "2026-10-17" (UTC)
    action: Mapped[str] = mapped_column(String(20), primary_key=True)
    count: Mapped[int] = mapped_column(default=0)
