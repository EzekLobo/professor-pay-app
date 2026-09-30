from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import LessonType


class ResetDataRequest(BaseModel):
    confirmation: Literal["RESETAR"]
    password: str = Field(min_length=1, max_length=128)


class ExportUser(BaseModel):
    id: UUID
    name: str
    email: str


class ExportClass(BaseModel):
    id: UUID
    name: str
    week_day: int
    start_time: str
    first_lesson_date: date
    lesson_count: int
    duration_minutes: int
    hourly_rate_cents: int
    active: bool


class ExportLesson(BaseModel):
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


class ExportPaymentConfirmation(BaseModel):
    id: UUID
    payment_date: date
    received_at: datetime
    note: str


class DataExportResponse(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    exported_at: datetime
    user: ExportUser
    classes: list[ExportClass]
    lessons: list[ExportLesson]
    payment_confirmations: list[ExportPaymentConfirmation]
