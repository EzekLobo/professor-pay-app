from __future__ import annotations

from datetime import date
from uuid import UUID

from app.domain import ClassData, LessonData, LessonType as DomainLessonType, get_lesson_value_cents, get_payment_date, get_period
from app.models import ClassRecord, Lesson


def class_data(record: ClassRecord) -> ClassData:
    return ClassData(
        id=str(record.id), name=record.name, first_lesson_date=record.first_lesson_date,
        lesson_count=record.lesson_count, duration_minutes=record.duration_minutes,
        hourly_rate_cents=record.hourly_rate_cents, active=record.active,
    )


def lesson_data(record: Lesson) -> LessonData:
    return LessonData(
        id=str(record.id), class_id=str(record.class_id) if record.class_id else None,
        class_name_snapshot=record.class_name_snapshot, number=record.number,
        lesson_date=record.lesson_date, student=record.student,
        type=DomainLessonType(record.type.value), duration_minutes=record.duration_minutes,
        hourly_rate_cents=record.hourly_rate_cents, active=record.active,
        canceled=record.canceled, note=record.note,
    )


def lesson_response(record: Lesson, as_of: date) -> dict[str, object]:
    data = lesson_data(record)
    status = "CANCELED" if not data.active or data.canceled else "COMPLETED" if data.lesson_date <= as_of else "FUTURE"
    return {
        "id": record.id, "class_id": record.class_id, "class_name_snapshot": record.class_name_snapshot,
        "number": record.number, "lesson_date": record.lesson_date, "student": record.student,
        "type": record.type, "duration_minutes": record.duration_minutes,
        "hourly_rate_cents": record.hourly_rate_cents, "active": record.active,
        "canceled": record.canceled, "note": record.note, "period": get_period(record.lesson_date),
        "payment_date": get_payment_date(record.lesson_date), "value_cents": get_lesson_value_cents(data),
        "status": status,
    }


def lesson_from_data(data: LessonData, user_id: UUID) -> Lesson:
    from app.models import LessonType

    return Lesson(
        user_id=user_id, class_id=UUID(data.class_id) if data.class_id else None,
        class_name_snapshot=data.class_name_snapshot, number=data.number, lesson_date=data.lesson_date,
        student=data.student, type=LessonType(data.type.value), duration_minutes=data.duration_minutes,
        hourly_rate_cents=data.hourly_rate_cents, active=data.active, canceled=data.canceled, note=data.note,
    )
