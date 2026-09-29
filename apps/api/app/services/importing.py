from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ClassRecord, ImportRecord, Lesson, LessonType, PaymentConfirmation
from app.schemas.imports import AulaPayExport, ImportReport

_IMPORT_NAMESPACE = UUID("a142d137-d8ee-4b61-afc5-58da2c04e3db")
_WEEK_DAYS = {"segunda": 0, "terca": 1, "quarta": 2, "quinta": 3, "sexta": 4, "sabado": 5, "domingo": 6}


def _centavos(value: float) -> int:
    return int((Decimal(str(value)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _minutes(value: float) -> int:
    return int((Decimal(str(value)) * 60).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _weekday(value: str) -> int:
    normalized = value.lower().replace("Ã§", "c").replace("ç", "c").replace("á", "a").replace("ã", "a")
    for name, number in _WEEK_DAYS.items():
        if normalized.startswith(name):
            return number
    raise ValueError(f"Unsupported Expo weekDay: {value}")


def _record(db: Session, user_id: UUID, export_id: str) -> ImportRecord | None:
    return db.scalar(select(ImportRecord).where(ImportRecord.user_id == user_id, ImportRecord.export_id == export_id))


def report_for(payload: AulaPayExport, previous: ImportRecord | None = None) -> ImportReport:
    return ImportReport(
        export_id=payload.export_id,
        already_imported=previous is not None,
        class_count=previous.class_count if previous else len(payload.classes),
        lesson_count=previous.lesson_count if previous else len(payload.lessons),
        payment_confirmation_count=previous.payment_confirmation_count if previous else len(payload.payment_confirmations),
        total_cents=previous.total_cents if previous else sum(_centavos(item.hourly_rate) * _minutes(item.duration_hours) // 60 for item in payload.lessons if item.active and not item.canceled),
        imported_at=previous.imported_at if previous else None,
    )


def preview_import(db: Session, user_id: UUID, payload: AulaPayExport) -> ImportReport:
    return report_for(payload, _record(db, user_id, payload.export_id))


def import_export(db: Session, user_id: UUID, payload: AulaPayExport) -> ImportReport:
    previous = _record(db, user_id, payload.export_id)
    if previous:
        return report_for(payload, previous)
    try:
        class_ids = {item.id: uuid5(_IMPORT_NAMESPACE, f"{user_id}:{payload.export_id}:class:{item.id}") for item in payload.classes}
        for item in payload.classes:
            db.add(ClassRecord(id=class_ids[item.id], user_id=user_id, name=item.name.strip(), week_day=_weekday(item.week_day), start_time=item.start_time, first_lesson_date=item.first_lesson_date, lesson_count=item.lesson_count, duration_minutes=_minutes(item.duration_hours), hourly_rate_cents=_centavos(item.hourly_rate), active=item.active))
        for item in payload.lessons:
            db.add(Lesson(id=uuid5(_IMPORT_NAMESPACE, f"{user_id}:{payload.export_id}:lesson:{item.id}"), user_id=user_id, class_id=class_ids.get(item.class_id), class_name_snapshot=item.class_name.strip(), number=item.number, lesson_date=item.lesson_date, student=item.student.strip(), type=LessonType.NORMAL if item.type == "Normal" else LessonType.EXTRA, duration_minutes=_minutes(item.duration_hours), hourly_rate_cents=_centavos(item.hourly_rate), active=item.active, canceled=item.canceled, note=item.note.strip()))
        for item in payload.payment_confirmations:
            db.add(PaymentConfirmation(id=uuid5(_IMPORT_NAMESPACE, f"{user_id}:{payload.export_id}:payment:{item.id}"), user_id=user_id, payment_date=item.payment_date, received_at=item.received_at, note=item.note.strip()))
        report = report_for(payload)
        imported_at = datetime.now(timezone.utc)
        db.add(ImportRecord(user_id=user_id, export_id=payload.export_id, exported_at=payload.exported_at, imported_at=imported_at, class_count=report.class_count, lesson_count=report.lesson_count, payment_confirmation_count=report.payment_confirmation_count, total_cents=report.total_cents))
        db.commit()
        return report.model_copy(update={"imported_at": imported_at})
    except Exception:
        db.rollback()
        raise
