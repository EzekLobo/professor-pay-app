from datetime import date, time
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ClassCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    week_day: int = Field(ge=0, le=6)
    start_time: time
    first_lesson_date: date
    lesson_count: int = Field(ge=1)
    duration_minutes: int = Field(ge=1)
    hourly_rate_cents: int = Field(ge=0)


class ClassUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    week_day: int | None = Field(default=None, ge=0, le=6)
    start_time: time | None = None
    first_lesson_date: date | None = None
    lesson_count: int | None = Field(default=None, ge=1)
    duration_minutes: int | None = Field(default=None, ge=1)
    hourly_rate_cents: int | None = Field(default=None, ge=0)


class ClassResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    week_day: int
    start_time: time
    first_lesson_date: date
    lesson_count: int
    duration_minutes: int
    hourly_rate_cents: int
    active: bool


class ClassListResponse(BaseModel):
    items: list[ClassResponse]
    total: int
