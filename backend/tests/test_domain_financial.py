from datetime import date

import pytest

from app.domain.class_editing import deactivate_class_lessons, lessons_for_class_update
from app.domain.financial import (
    ClassData,
    LessonData,
    LessonType,
    build_dashboard,
    filter_lesson_history_by_kind,
    filter_lessons_by_kind,
    generate_lessons_for_class,
    get_lesson_value_cents,
    get_payment_date,
    get_period,
    is_valid_iso_date,
    relevant_payments,
)


@pytest.fixture
def class_record() -> ClassData:
    return ClassData("class-1", "Segunda 19h", date(2026, 5, 4), 4, 60, 4_000)


def lesson(**overrides: object) -> LessonData:
    values: dict[str, object] = {
        "id": "lesson-1",
        "class_id": "class-1",
        "class_name_snapshot": "Segunda 19h",
        "number": 1,
        "lesson_date": date(2026, 5, 4),
        "student": "",
        "type": LessonType.NORMAL,
        "duration_minutes": 60,
        "hourly_rate_cents": 5_000,
    }
    values.update(overrides)
    return LessonData(**values)  # type: ignore[arg-type]


def test_valid_iso_dates_and_quinzenas() -> None:
    assert is_valid_iso_date("2026-05-04")
    assert not is_valid_iso_date("2026-02-30")
    assert not is_valid_iso_date("04/05/2026")
    assert get_period(date(2026, 5, 1)) == "01 a 15/05/2026"
    assert get_period(date(2026, 5, 16)) == "16 a 31/05/2026"
    assert get_payment_date(date(2026, 5, 15)) == date(2026, 6, 1)
    assert get_payment_date(date(2026, 5, 16)) == date(2026, 6, 15)
    assert get_payment_date(date(2026, 12, 20)) == date(2027, 1, 15)


def test_money_is_integral_centavos_with_half_up_rounding() -> None:
    assert get_lesson_value_cents(lesson(duration_minutes=90, hourly_rate_cents=4_500)) == 6_750
    assert get_lesson_value_cents(lesson(duration_minutes=1, hourly_rate_cents=1)) == 0
    assert get_lesson_value_cents(lesson(duration_minutes=30, hourly_rate_cents=1)) == 1


def test_generates_weekly_lessons(class_record: ClassData) -> None:
    lessons = generate_lessons_for_class(class_record)
    assert [item.lesson_date for item in lessons] == [
        date(2026, 5, 4),
        date(2026, 5, 11),
        date(2026, 5, 18),
        date(2026, 5, 25),
    ]
    assert lessons[0].id == "class-1-lesson-1"
    with pytest.raises(ValueError):
        generate_lessons_for_class(ClassData("bad", "Bad", date.today(), 0, 60, 100))


def test_dashboard_groups_payments_and_excludes_canceled(class_record: ClassData) -> None:
    dashboard = build_dashboard(
        [class_record],
        [
            lesson(id="normal", lesson_date=date(2026, 5, 4), hourly_rate_cents=5_000),
            lesson(
                id="extra",
                class_id=None,
                class_name_snapshot="Extra",
                type=LessonType.EXTRA,
                lesson_date=date(2026, 5, 5),
                hourly_rate_cents=3_000,
            ),
            lesson(id="future", lesson_date=date(2026, 6, 1), duration_minutes=120),
            lesson(id="canceled", lesson_date=date(2026, 6, 8), duration_minutes=120, active=False, canceled=True),
        ],
        [date(2026, 6, 1)],
        date(2026, 5, 20),
    )
    assert dashboard.earned_cents == 8_000
    assert (dashboard.normal_earned_cents, dashboard.extra_earned_cents) == (5_000, 3_000)
    assert (dashboard.planned_cents, dashboard.total_planned_cents, dashboard.total_lessons) == (10_000, 18_000, 3)
    assert dashboard.payments[0].status == "RECEIVED"
    assert dashboard.progress[0].lesson_count == 2
    assert [item.lesson.id for item in filter_lessons_by_kind(dashboard.lessons, LessonType.EXTRA)] == ["extra"]
    assert [item.lesson.id for item in filter_lesson_history_by_kind(dashboard.lessons, None, date(2026, 5, 20))] == ["extra", "normal"]


def test_relevant_payments_include_current_history_and_one_future(class_record: ClassData) -> None:
    dashboard = build_dashboard(
        [class_record],
        [
            lesson(id="older", lesson_date=date(2026, 4, 20)),
            lesson(id="newer", lesson_date=date(2026, 5, 4)),
            lesson(id="next", lesson_date=date(2026, 5, 20)),
            lesson(id="far", lesson_date=date(2026, 6, 20)),
        ],
        [],
        date(2026, 6, 10),
    )
    assert [item.payment_date for item in relevant_payments(dashboard.payments, dashboard.today)] == [
        date(2026, 6, 15),
        date(2026, 6, 1),
        date(2026, 5, 15),
    ]


def test_class_update_preserves_received_lessons_and_regenerates_remaining(class_record: ClassData) -> None:
    existing = generate_lessons_for_class(class_record)
    updated = ClassData("class-1", "Segunda 20h", date(2026, 5, 5), 5, 120, 6_000)
    result = lessons_for_class_update(updated, existing, {date(2026, 6, 1)})
    assert [item.lesson_date for item in result.preserved] == [date(2026, 5, 4), date(2026, 5, 11)]
    assert [item.lesson_date for item in result.recalculated] == [date(2026, 5, 19), date(2026, 5, 26), date(2026, 6, 2)]
    assert all(item.hourly_rate_cents == 6_000 and item.duration_minutes == 120 for item in result.recalculated)


def test_repeated_class_edits_do_not_duplicate_ids(class_record: ClassData) -> None:
    first = lessons_for_class_update(
        ClassData("class-1", "Segunda 19h", date(2026, 5, 11), 4, 60, 4_000),
        generate_lessons_for_class(class_record),
        set(),
    )
    second = lessons_for_class_update(
        ClassData("class-1", "Segunda 19h", date(2026, 5, 18), 4, 60, 4_000), first.next_lessons, set()
    )
    assert [item.lesson_date for item in second.next_lessons] == [date(2026, 5, 18), date(2026, 5, 25), date(2026, 6, 1), date(2026, 6, 8)]
    assert len({item.id for item in second.next_lessons}) == 4


def test_deactivation_keeps_received_and_extra_lessons(class_record: ClassData) -> None:
    extra = lesson(
        id="extra", class_id=None, class_name_snapshot="Extra", type=LessonType.EXTRA, lesson_date=date(2026, 5, 12), hourly_rate_cents=3_000
    )
    existing = (*generate_lessons_for_class(class_record), extra)
    result = deactivate_class_lessons("class-1", existing, {date(2026, 6, 1)})
    assert [(item.lesson_date, item.active, item.canceled) for item in result[:4]] == [
        (date(2026, 5, 4), True, False),
        (date(2026, 5, 11), True, False),
        (date(2026, 5, 18), False, True),
        (date(2026, 5, 25), False, True),
    ]
    assert result[-1] == extra
