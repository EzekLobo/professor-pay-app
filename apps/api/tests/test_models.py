from datetime import date, datetime, time, timezone
from uuid import UUID

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import ClassRecord, Lesson, LessonType, PaymentConfirmation, User


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    with Session(engine) as db_session:
        yield db_session


def make_user(email: str = "professor@example.com") -> User:
    return User(name="Professora", email=email, password_hash="not-a-real-password-hash")


def test_user_owned_records_use_uuid_and_integer_money(session: Session) -> None:
    user = make_user()
    session.add(user)
    session.flush()
    class_record = ClassRecord(
        user_id=user.id,
        name="Matemática",
        week_day=2,
        start_time=time(9, 30),
        first_lesson_date=date(2026, 1, 7),
        lesson_count=10,
        duration_minutes=90,
        hourly_rate_cents=12_550,
    )
    session.add(class_record)
    session.flush()
    lesson = Lesson(
        user_id=user.id,
        class_id=class_record.id,
        class_name_snapshot=class_record.name,
        number=1,
        lesson_date=date(2026, 1, 7),
        student="Ana",
        type=LessonType.NORMAL,
        duration_minutes=90,
        hourly_rate_cents=12_550,
    )
    confirmation = PaymentConfirmation(
        user_id=user.id,
        payment_date=date(2026, 1, 15),
        received_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
    )
    session.add_all([lesson, confirmation])
    session.commit()

    assert class_record.id is not None
    assert lesson.user_id == user.id
    assert lesson.hourly_rate_cents == 12_550
    assert user.classes == [class_record]
    assert user.lessons == [lesson]


def test_confirmation_is_unique_per_user_and_payment_date(session: Session) -> None:
    user = make_user()
    session.add(user)
    session.flush()
    session.add_all(
        [
            PaymentConfirmation(
                user_id=user.id,
                payment_date=date(2026, 1, 15),
                received_at=datetime.now(timezone.utc),
            ),
            PaymentConfirmation(
                user_id=user.id,
                payment_date=date(2026, 1, 15),
                received_at=datetime.now(timezone.utc),
            ),
        ]
    )
    with pytest.raises(IntegrityError):
        session.commit()


def test_same_payment_date_is_allowed_for_different_users(session: Session) -> None:
    first_user = make_user("first@example.com")
    second_user = make_user("second@example.com")
    session.add_all([first_user, second_user])
    session.flush()
    session.add_all(
        [
            PaymentConfirmation(
                user_id=first_user.id,
                payment_date=date(2026, 1, 15),
                received_at=datetime.now(timezone.utc),
            ),
            PaymentConfirmation(
                user_id=second_user.id,
                payment_date=date(2026, 1, 15),
                received_at=datetime.now(timezone.utc),
            ),
        ]
    )
    session.commit()
    assert session.query(PaymentConfirmation).count() == 2


def test_lesson_cannot_reference_a_user_that_does_not_exist(session: Session) -> None:
    session.add(
        Lesson(
            user_id=UUID("f56f2ac8-63ed-4d8c-b24c-9c0a2a1b8c07"),
            class_name_snapshot="Extra",
            number=1,
            lesson_date=date(2026, 1, 7),
            student="Ana",
            type=LessonType.EXTRA,
            duration_minutes=60,
            hourly_rate_cents=10_000,
        )
    )
    with pytest.raises(IntegrityError):
        session.commit()
