from datetime import date
from uuid import UUID

from pydantic import BaseModel


class DashboardLesson(BaseModel):
    id: UUID
    class_id: UUID | None
    class_name_snapshot: str
    number: int
    lesson_date: date
    student: str
    type: str
    duration_minutes: int
    hourly_rate_cents: int
    period: str
    payment_date: date
    value_cents: int
    status: str


class DashboardPayment(BaseModel):
    payment_date: date
    period: str
    lesson_count: int
    normal_count: int
    extra_count: int
    normal_total_cents: int
    extra_total_cents: int
    total_cents: int
    status: str
    lessons: list[DashboardLesson]


class DashboardProgress(BaseModel):
    class_id: UUID
    name: str
    lesson_count: int
    completed: int
    remaining: int
    percent: int


class DashboardResponse(BaseModel):
    today: date
    earned_cents: int
    received_cents: int
    normal_lessons: int
    extra_lessons: int
    normal_earned_cents: int
    extra_earned_cents: int
    planned_cents: int
    future_lessons: int
    total_planned_cents: int
    total_lessons: int
    last_payment: DashboardPayment | None
    next_payment: DashboardPayment | None
    payments: list[DashboardPayment]
    progress: list[DashboardProgress]
