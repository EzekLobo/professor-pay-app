from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import LessonType


class ExtraLessonCreate(BaseModel):
    student: str = Field(min_length=1, max_length=255)
    lesson_date: date
    duration_minutes: int = Field(ge=1)
    hourly_rate_cents: int = Field(ge=0)
    note: str = Field(default="", max_length=1000)


class LessonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    class_id: UUID | None
    class_name_snapshot: str
    number: int
    lesson_date: date
    student: str
    type: LessonType
    duration_minutes: int
    hourly_rate_cents: int
    active: bool
    canceled: bool
    note: str
    period: str
    payment_date: date
    value_cents: int
    status: str


class LessonListResponse(BaseModel):
    items: list[LessonResponse]
    total: int
    page: int
    page_size: int


LessonStatusFilter = Literal["ACTIVE", "CANCELED", "COMPLETED", "FUTURE"]
