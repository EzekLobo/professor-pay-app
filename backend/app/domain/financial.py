"""Date, money and dashboard calculations for AulaPay.

Amounts are always integer Brazilian centavos.  Keeping money integral avoids
the binary floating point rounding used by the former mobile implementation.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum
from typing import Iterable


class LessonType(StrEnum):
    NORMAL = "NORMAL"
    EXTRA = "EXTRA"


@dataclass(frozen=True, slots=True)
class ClassData:
    id: str
    name: str
    first_lesson_date: date
    lesson_count: int
    duration_minutes: int
    hourly_rate_cents: int
    active: bool = True


@dataclass(frozen=True, slots=True)
class LessonData:
    id: str
    class_id: str | None
    class_name_snapshot: str
    number: int
    lesson_date: date
    student: str
    type: LessonType
    duration_minutes: int
    hourly_rate_cents: int
    active: bool = True
    canceled: bool = False
    note: str = ""


@dataclass(frozen=True, slots=True)
class LessonView:
    lesson: LessonData
    period: str
    payment_date: date
    value_cents: int
    status: str


@dataclass(frozen=True, slots=True)
class PaymentView:
    payment_date: date
    period: str
    lesson_count: int
    normal_count: int
    extra_count: int
    normal_total_cents: int
    extra_total_cents: int
    total_cents: int
    status: str
    lessons: tuple[LessonView, ...]


@dataclass(frozen=True, slots=True)
class ClassProgress:
    class_id: str
    name: str
    lesson_count: int
    completed: int
    remaining: int
    percent: int


@dataclass(frozen=True, slots=True)
class Dashboard:
    today: date
    lessons: tuple[LessonView, ...]
    payments: tuple[PaymentView, ...]
    last_payment: PaymentView | None
    next_payment: PaymentView | None
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
    progress: tuple[ClassProgress, ...]


def is_valid_iso_date(value: str) -> bool:
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def get_period(lesson_date: date) -> str:
    bounds = "01 a 15" if lesson_date.day <= 15 else "16 a 31"
    return f"{bounds}/{lesson_date.month:02d}/{lesson_date.year}"


def get_payment_date(lesson_date: date) -> date:
    year = lesson_date.year + (lesson_date.month == 12)
    month = 1 if lesson_date.month == 12 else lesson_date.month + 1
    return date(year, month, 1 if lesson_date.day <= 15 else 15)


def get_lesson_value_cents(lesson: LessonData) -> int:
    """Calculate a lesson value, rounding half up to the nearest centavo."""
    numerator = lesson.duration_minutes * lesson.hourly_rate_cents
    return (numerator + 30) // 60


def generate_lessons_for_class(class_record: ClassData) -> tuple[LessonData, ...]:
    if class_record.lesson_count < 1:
        raise ValueError("lesson_count must be positive")
    if class_record.duration_minutes < 1:
        raise ValueError("duration_minutes must be positive")
    if class_record.hourly_rate_cents < 0:
        raise ValueError("hourly_rate_cents must not be negative")
    return tuple(
        LessonData(
            id=f"{class_record.id}-lesson-{number}",
            class_id=class_record.id,
            class_name_snapshot=class_record.name,
            number=number,
            lesson_date=class_record.first_lesson_date + timedelta(days=(number - 1) * 7),
            student="",
            type=LessonType.NORMAL,
            duration_minutes=class_record.duration_minutes,
            hourly_rate_cents=class_record.hourly_rate_cents,
        )
        for number in range(1, class_record.lesson_count + 1)
    )


def build_dashboard(
    classes: Iterable[ClassData],
    raw_lessons: Iterable[LessonData],
    confirmed_payment_dates: Iterable[date],
    today: date,
) -> Dashboard:
    confirmations = set(confirmed_payment_dates)
    lessons = tuple(_view_lesson(lesson, today) for lesson in raw_lessons)
    billable = tuple(item for item in lessons if item.lesson.active and not item.lesson.canceled)
    payments = _build_payments(billable, confirmations, today)
    payable = tuple(payment for payment in payments if payment.total_cents > 0)
    last_payment = next((item for item in reversed(payable) if item.payment_date <= today), None)
    next_payment = next((item for item in payable if item.payment_date > today), None)
    completed = tuple(item for item in billable if item.lesson.lesson_date <= today)
    future = tuple(item for item in billable if item.lesson.lesson_date > today)
    normal_completed = tuple(item for item in completed if item.lesson.type == LessonType.NORMAL)
    extra_completed = tuple(item for item in completed if item.lesson.type == LessonType.EXTRA)
    received = sum(
        payment.total_cents
        for payment in payments
        if payment.payment_date <= today or payment.payment_date in confirmations
    )
    return Dashboard(
        today=today,
        lessons=lessons,
        payments=payments,
        last_payment=last_payment,
        next_payment=next_payment,
        earned_cents=_sum_values(completed),
        received_cents=received,
        normal_lessons=len(normal_completed),
        extra_lessons=len(extra_completed),
        normal_earned_cents=_sum_values(normal_completed),
        extra_earned_cents=_sum_values(extra_completed),
        planned_cents=_sum_values(future),
        future_lessons=len(future),
        total_planned_cents=_sum_values(billable),
        total_lessons=len(billable),
        progress=_build_progress(classes, billable, today),
    )


def filter_lessons_by_kind(lessons: Iterable[LessonView], kind: LessonType | None) -> tuple[LessonView, ...]:
    return tuple(
        item
        for item in lessons
        if item.lesson.active and not item.lesson.canceled and (kind is None or item.lesson.type == kind)
    )


def filter_lesson_history_by_kind(
    lessons: Iterable[LessonView], kind: LessonType | None, today: date
) -> tuple[LessonView, ...]:
    return tuple(
        sorted(
            (item for item in filter_lessons_by_kind(lessons, kind) if item.lesson.lesson_date <= today),
            key=lambda item: item.lesson.lesson_date,
            reverse=True,
        )
    )


def relevant_payments(payments: Iterable[PaymentView], today: date) -> tuple[PaymentView, ...]:
    values = tuple(payments)
    current = [item for item in values if item.payment_date <= today or item.status == "RECEIVED"]
    current_dates = {item.payment_date for item in current}
    next_future = next(
        (item for item in values if item.payment_date > today and item.payment_date not in current_dates), None
    )
    return tuple(sorted([*current, *([next_future] if next_future else [])], key=lambda item: item.payment_date, reverse=True))


def _view_lesson(lesson: LessonData, today: date) -> LessonView:
    status = "CANCELED" if not lesson.active or lesson.canceled else "COMPLETED" if lesson.lesson_date <= today else "FUTURE"
    return LessonView(lesson, get_period(lesson.lesson_date), get_payment_date(lesson.lesson_date), get_lesson_value_cents(lesson), status)


def _build_payments(lessons: Iterable[LessonView], confirmations: set[date], today: date) -> tuple[PaymentView, ...]:
    groups: dict[date, list[LessonView]] = {}
    for lesson in lessons:
        groups.setdefault(lesson.payment_date, []).append(lesson)
    results: list[PaymentView] = []
    for payment_date, group in sorted(groups.items()):
        normal = [item for item in group if item.lesson.type == LessonType.NORMAL]
        extra = [item for item in group if item.lesson.type == LessonType.EXTRA]
        status = "RECEIVED" if payment_date in confirmations else "OVERDUE" if payment_date < today else "DUE_TODAY" if payment_date == today else "FUTURE"
        results.append(PaymentView(payment_date, group[0].period, len(group), len(normal), len(extra), _sum_values(normal), _sum_values(extra), _sum_values(group), status, tuple(sorted(group, key=lambda item: item.lesson.lesson_date, reverse=True))))
    return tuple(results)


def _build_progress(classes: Iterable[ClassData], lessons: Iterable[LessonView], today: date) -> tuple[ClassProgress, ...]:
    result: list[ClassProgress] = []
    values = tuple(lessons)
    for class_record in classes:
        if not class_record.active:
            continue
        class_lessons = tuple(item for item in values if item.lesson.class_id == class_record.id)
        completed = sum(item.lesson.lesson_date <= today for item in class_lessons)
        count = len(class_lessons)
        result.append(ClassProgress(class_record.id, class_record.name, count, completed, max(count - completed, 0), round(completed * 100 / count) if count else 0))
    return tuple(result)


def _sum_values(lessons: Iterable[LessonView]) -> int:
    return sum(item.value_cents for item in lessons)
