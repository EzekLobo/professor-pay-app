from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_owned_or_404
from app.core.security import verify_password
from app.db.session import get_db
from app.domain import (
    build_dashboard,
    deactivate_class_lessons,
    generate_lessons_for_class,
    lessons_for_class_update,
)
from app.models import ClassRecord, Lesson, LessonType, PaymentConfirmation
from app.schemas.classes import ClassCreate, ClassListResponse, ClassResponse, ClassUpdate
from app.schemas.dashboard import DashboardResponse
from app.schemas.data import DataExportResponse, ResetDataRequest
from app.schemas.lessons import ExtraLessonCreate, LessonListResponse, LessonResponse, LessonStatusFilter
from app.schemas.payments import (
    PaymentConfirmationRequest,
    PaymentConfirmationResponse,
    PaymentDetailResponse,
    PaymentListResponse,
)
from app.services.financial import class_data, lesson_data, lesson_from_data, lesson_response

router = APIRouter(prefix="/api/v1", tags=["financial"])
DbSession = Annotated[Session, Depends(get_db)]


def _commit(db: Session) -> None:
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def _received_dates(db: Session, user_id: UUID) -> set[date]:
    return set(db.scalars(select(PaymentConfirmation.payment_date).where(PaymentConfirmation.user_id == user_id)))


def _user_dashboard(db: Session, user_id: UUID, reference: date):
    classes = list(db.scalars(select(ClassRecord).where(ClassRecord.user_id == user_id)))
    lessons = list(db.scalars(select(Lesson).where(Lesson.user_id == user_id)))
    return build_dashboard(
        (class_data(record) for record in classes),
        (lesson_data(record) for record in lessons),
        _received_dates(db, user_id),
        reference,
    )


def _payment_or_404(db: Session, user_id: UUID, payment_date: date, reference: date):
    dashboard = _user_dashboard(db, user_id, reference)
    payment = next((item for item in dashboard.payments if item.payment_date == payment_date), None)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


def _confirmation(db: Session, user_id: UUID, payment_date: date) -> PaymentConfirmation | None:
    return db.scalar(
        select(PaymentConfirmation).where(
            PaymentConfirmation.user_id == user_id,
            PaymentConfirmation.payment_date == payment_date,
        )
    )


def _class_from_payload(payload: ClassCreate, user_id: UUID) -> ClassRecord:
    return ClassRecord(user_id=user_id, **payload.model_dump())


@router.get("/classes", response_model=ClassListResponse)
def list_classes(
    current_user: CurrentUser,
    db: DbSession,
    active: bool | None = None,
) -> dict[str, object]:
    statement = select(ClassRecord).where(ClassRecord.user_id == current_user.id).order_by(ClassRecord.name)
    if active is not None:
        statement = statement.where(ClassRecord.active == active)
    records = list(db.scalars(statement))
    return {"items": records, "total": len(records)}


@router.post("/classes", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
def create_class(payload: ClassCreate, current_user: CurrentUser, db: DbSession) -> ClassRecord:
    record = _class_from_payload(payload, current_user.id)
    db.add(record)
    db.flush()
    for lesson in generate_lessons_for_class(class_data(record)):
        db.add(lesson_from_data(lesson, current_user.id))
    _commit(db)
    db.refresh(record)
    return record


@router.get("/classes/{class_id}", response_model=ClassResponse)
def get_class(class_id: UUID, current_user: CurrentUser, db: DbSession) -> ClassRecord:
    return get_owned_or_404(db, ClassRecord, class_id, current_user.id)


@router.patch("/classes/{class_id}", response_model=ClassResponse)
def update_class(class_id: UUID, payload: ClassUpdate, current_user: CurrentUser, db: DbSession) -> ClassRecord:
    record = get_owned_or_404(db, ClassRecord, class_id, current_user.id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return record
    for field, value in changes.items():
        setattr(record, field, value)
    db.flush()
    existing = list(db.scalars(select(Lesson).where(Lesson.user_id == current_user.id, Lesson.class_id == record.id)))
    result = lessons_for_class_update(class_data(record), (lesson_data(item) for item in existing), _received_dates(db, current_user.id))
    preserved_ids = {item.id for item in result.preserved}
    for item in existing:
        if str(item.id) not in preserved_ids:
            db.delete(item)
    for item in result.recalculated:
        db.add(lesson_from_data(item, current_user.id))
    _commit(db)
    db.refresh(record)
    return record


@router.post("/classes/{class_id}/deactivate", response_model=ClassResponse)
def deactivate_class(class_id: UUID, current_user: CurrentUser, db: DbSession) -> ClassRecord:
    record = get_owned_or_404(db, ClassRecord, class_id, current_user.id)
    existing = list(db.scalars(select(Lesson).where(Lesson.user_id == current_user.id, Lesson.class_id == record.id)))
    next_lessons = deactivate_class_lessons(
        str(record.id), (lesson_data(item) for item in existing), _received_dates(db, current_user.id)
    )
    by_id = {str(item.id): item for item in existing}
    for next_lesson in next_lessons:
        item = by_id[str(next_lesson.id)]
        item.active = next_lesson.active
        item.canceled = next_lesson.canceled
    record.active = False
    _commit(db)
    db.refresh(record)
    return record


@router.get("/lessons", response_model=LessonListResponse)
def list_lessons(
    current_user: CurrentUser,
    db: DbSession,
    type: LessonType | None = None,
    status_filter: Annotated[LessonStatusFilter | None, Query(alias="status")] = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    as_of: date | None = None,
) -> dict[str, object]:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="from must be before or equal to to")
    reference = as_of or date.today()
    statement = select(Lesson).where(Lesson.user_id == current_user.id)
    if type:
        statement = statement.where(Lesson.type == type)
    if date_from:
        statement = statement.where(Lesson.lesson_date >= date_from)
    if date_to:
        statement = statement.where(Lesson.lesson_date <= date_to)
    records = list(db.scalars(statement.order_by(Lesson.lesson_date.desc(), Lesson.created_at.desc())))
    values = [lesson_response(record, reference) for record in records]
    if status_filter:
        values = [item for item in values if _matches_status(item, status_filter)]
    total = len(values)
    start = (page - 1) * page_size
    return {"items": values[start : start + page_size], "total": total, "page": page, "page_size": page_size}


def _matches_status(item: dict[str, object], status_filter: LessonStatusFilter) -> bool:
    if status_filter == "ACTIVE":
        return item["status"] in {"COMPLETED", "FUTURE"}
    return item["status"] == status_filter


@router.post("/lessons/extras", response_model=LessonResponse, status_code=status.HTTP_201_CREATED)
def create_extra_lesson(payload: ExtraLessonCreate, current_user: CurrentUser, db: DbSession) -> dict[str, object]:
    record = Lesson(
        user_id=current_user.id,
        class_name_snapshot="Aula extra",
        number=1,
        lesson_date=payload.lesson_date,
        student=payload.student.strip(),
        type=LessonType.EXTRA,
        duration_minutes=payload.duration_minutes,
        hourly_rate_cents=payload.hourly_rate_cents,
        note=payload.note.strip(),
    )
    db.add(record)
    _commit(db)
    db.refresh(record)
    return lesson_response(record, date.today())


@router.post("/lessons/{lesson_id}/cancel", response_model=LessonResponse)
def cancel_lesson(lesson_id: UUID, current_user: CurrentUser, db: DbSession) -> dict[str, object]:
    record = get_owned_or_404(db, Lesson, lesson_id, current_user.id)
    if record.canceled:
        return lesson_response(record, date.today())
    from app.domain import get_payment_date

    if get_payment_date(record.lesson_date) in _received_dates(db, current_user.id):
        raise HTTPException(status_code=409, detail="Received lessons cannot be canceled")
    record.active = False
    record.canceled = True
    _commit(db)
    db.refresh(record)
    return lesson_response(record, date.today())


def _dashboard_lesson(item: object) -> dict[str, object]:
    view = item
    lesson = view.lesson
    return {
        "id": UUID(lesson.id), "class_id": UUID(lesson.class_id) if lesson.class_id else None,
        "class_name_snapshot": lesson.class_name_snapshot, "number": lesson.number,
        "lesson_date": lesson.lesson_date, "student": lesson.student, "type": lesson.type.value,
        "duration_minutes": lesson.duration_minutes, "hourly_rate_cents": lesson.hourly_rate_cents,
        "period": view.period, "payment_date": view.payment_date, "value_cents": view.value_cents,
        "status": view.status,
    }


def _dashboard_payment(payment: object) -> dict[str, object]:
    return {
        "payment_date": payment.payment_date, "period": payment.period, "lesson_count": payment.lesson_count,
        "normal_count": payment.normal_count, "extra_count": payment.extra_count,
        "normal_total_cents": payment.normal_total_cents, "extra_total_cents": payment.extra_total_cents,
        "total_cents": payment.total_cents, "status": payment.status,
        "lessons": [_dashboard_lesson(item) for item in payment.lessons],
    }


@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(current_user: CurrentUser, db: DbSession, as_of: date | None = None) -> dict[str, object]:
    reference = as_of or date.today()
    dashboard = _user_dashboard(db, current_user.id, reference)
    return {
        "today": dashboard.today, "earned_cents": dashboard.earned_cents,
        "received_cents": dashboard.received_cents, "normal_lessons": dashboard.normal_lessons,
        "extra_lessons": dashboard.extra_lessons, "normal_earned_cents": dashboard.normal_earned_cents,
        "extra_earned_cents": dashboard.extra_earned_cents, "planned_cents": dashboard.planned_cents,
        "future_lessons": dashboard.future_lessons, "total_planned_cents": dashboard.total_planned_cents,
        "total_lessons": dashboard.total_lessons, "last_payment": _dashboard_payment(dashboard.last_payment) if dashboard.last_payment else None,
        "next_payment": _dashboard_payment(dashboard.next_payment) if dashboard.next_payment else None,
        "payments": [_dashboard_payment(item) for item in dashboard.payments],
        "progress": [
            {"class_id": UUID(item.class_id), "name": item.name, "lesson_count": item.lesson_count,
             "completed": item.completed, "remaining": item.remaining, "percent": item.percent}
            for item in dashboard.progress
        ],
    }


@router.get("/payments", response_model=PaymentListResponse)
def list_payments(current_user: CurrentUser, db: DbSession, as_of: date | None = None) -> dict[str, object]:
    dashboard = _user_dashboard(db, current_user.id, as_of or date.today())
    items = [_dashboard_payment(payment) for payment in dashboard.payments]
    return {"items": items, "total": len(items)}


@router.get("/payments/{payment_date}", response_model=PaymentDetailResponse)
def get_payment(payment_date: date, current_user: CurrentUser, db: DbSession, as_of: date | None = None) -> dict[str, object]:
    payment = _payment_or_404(db, current_user.id, payment_date, as_of or date.today())
    confirmation = _confirmation(db, current_user.id, payment_date)
    return {
        **_dashboard_payment(payment),
        "received_at": confirmation.received_at if confirmation else None,
        "confirmation_note": confirmation.note if confirmation else None,
    }


@router.post("/payments/{payment_date}/confirm", response_model=PaymentConfirmationResponse)
def confirm_payment(
    payment_date: date,
    payload: PaymentConfirmationRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> dict[str, object]:
    # Verify a payment exists before writing a confirmation for an arbitrary date.
    _payment_or_404(db, current_user.id, payment_date, date.today())
    confirmation = _confirmation(db, current_user.id, payment_date)
    if confirmation is None:
        confirmation = PaymentConfirmation(
            user_id=current_user.id,
            payment_date=payment_date,
            received_at=datetime.now(timezone.utc),
            note=payload.note.strip(),
        )
        db.add(confirmation)
        try:
            db.commit()
        except IntegrityError:
            # The unique constraint is the final protection when two requests race.
            db.rollback()
            confirmation = _confirmation(db, current_user.id, payment_date)
            if confirmation is None:
                raise
    db.refresh(confirmation)
    payment = _payment_or_404(db, current_user.id, payment_date, date.today())
    return {
        "payment": _dashboard_payment(payment),
        "received_at": confirmation.received_at,
        "note": confirmation.note,
    }


@router.delete("/payments/{payment_date}/confirmation", status_code=status.HTTP_204_NO_CONTENT)
def reverse_payment_confirmation(payment_date: date, current_user: CurrentUser, db: DbSession) -> Response:
    confirmation = _confirmation(db, current_user.id, payment_date)
    if confirmation is not None:
        db.delete(confirmation)
        _commit(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/data/export", response_model=DataExportResponse)
def export_data(current_user: CurrentUser, db: DbSession) -> dict[str, object]:
    classes = list(
        db.scalars(
            select(ClassRecord)
            .where(ClassRecord.user_id == current_user.id)
            .order_by(ClassRecord.created_at)
        )
    )
    lessons = list(
        db.scalars(
            select(Lesson)
            .where(Lesson.user_id == current_user.id)
            .order_by(Lesson.lesson_date, Lesson.created_at)
        )
    )
    confirmations = list(
        db.scalars(
            select(PaymentConfirmation)
            .where(PaymentConfirmation.user_id == current_user.id)
            .order_by(PaymentConfirmation.payment_date)
        )
    )
    return {
        "exported_at": datetime.now(timezone.utc),
        "user": {"id": current_user.id, "name": current_user.name, "email": current_user.email},
        "classes": [
            {
                **{
                    field: getattr(record, field)
                    for field in (
                        "id", "name", "week_day", "first_lesson_date", "lesson_count",
                        "duration_minutes", "hourly_rate_cents", "active",
                    )
                },
                "start_time": record.start_time.isoformat(),
            }
            for record in classes
        ],
        "lessons": [
            {
                field: getattr(record, field)
                for field in (
                    "id", "class_id", "class_name_snapshot", "number", "lesson_date", "student",
                    "type", "duration_minutes", "hourly_rate_cents", "active", "canceled", "note",
                )
            }
            for record in lessons
        ],
        "payment_confirmations": [
            {field: getattr(record, field) for field in ("id", "payment_date", "received_at", "note")}
            for record in confirmations
        ],
    }


@router.delete("/data", status_code=status.HTTP_204_NO_CONTENT)
def reset_data(payload: ResetDataRequest, current_user: CurrentUser, db: DbSession) -> Response:
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is invalid")
    try:
        db.execute(delete(PaymentConfirmation).where(PaymentConfirmation.user_id == current_user.id))
        db.execute(delete(Lesson).where(Lesson.user_id == current_user.id))
        db.execute(delete(ClassRecord).where(ClassRecord.user_id == current_user.id))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)
