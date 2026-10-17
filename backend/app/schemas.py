"""Request and response shapes (Pydantic).

"In" models describe what the frontend is allowed to send. FastAPI rejects
anything that doesn't match with a 422 error that explains which field is wrong.
"Out" models describe what we send back.

Note: no "In" model has a user_id field, so nobody can create a palace for
someone else. The user always comes from the verified Auth0 token.
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


# ---------- users ----------

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    auth0_sub: str
    email: str | None
    name: str | None
    created_at: datetime | None


# ---------- locations ----------

class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    lat: float
    lng: float
    route_order: int
    description: str | None


# ---------- creating a palace ----------

class QuestionIn(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    type: Literal["multiple_choice", "short_answer"] = "short_answer"
    choices: list[str] | None = None

    @model_validator(mode="after")
    def check_choices(self):
        if self.type == "multiple_choice":
            if not self.choices or len(self.choices) < 2:
                raise ValueError("multiple_choice questions need at least 2 choices")
            if self.answer not in self.choices:
                raise ValueError("the answer must be one of the choices")
        return self


class StopIn(BaseModel):
    concept: str = Field(min_length=1, max_length=300)
    association: str = Field(min_length=1)
    # Optional. Leave both out and the backend places stops on the route in the
    # order you send them (1st concept -> 1st location on the route, and so on).
    location_id: int | None = None
    stop_order: int | None = Field(default=None, ge=1)
    questions: list[QuestionIn] = []


class PalaceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    source_text: str | None = None
    stops: list[StopIn] = Field(min_length=1)


class PalaceCreated(BaseModel):
    id: int


# ---------- reading a palace ----------

class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question: str
    answer: str
    type: str
    choices: list[str] | None


class StopOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stop_order: int
    concept: str
    association: str
    location: LocationOut
    questions: list[QuestionOut]


class PalaceDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    source_text: str | None
    created_at: datetime | None
    stops: list[StopOut]


class PalaceSummary(BaseModel):
    """One row in the dashboard list."""
    id: int
    title: str
    created_at: datetime | None
    stop_count: int


# ---------- quiz attempts ----------

class AttemptIn(BaseModel):
    score: int = Field(ge=0)
    total: int = Field(ge=1)

    @model_validator(mode="after")
    def score_not_above_total(self):
        if self.score > self.total:
            raise ValueError("score can't be higher than total")
        return self


class AttemptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    palace_id: int
    score: int
    total: int
    taken_at: datetime | None
