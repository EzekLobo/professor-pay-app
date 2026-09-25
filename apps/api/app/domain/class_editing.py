"""Pure class-editing rules which preserve financial history."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date
from typing import Iterable

from app.domain.financial import ClassData, LessonData, generate_lessons_for_class, get_payment_date


@dataclass(frozen=True, slots=True)
class ClassUpdateResult:
    preserved: tuple[LessonData, ...]
    recalculated: tuple[LessonData, ...]
    next_lessons: tuple[LessonData, ...]


def lessons_for_class_update(
    updated_class: ClassData,
    existing_lessons: Iterable[LessonData],
    received_payment_dates: set[date],
) -> ClassUpdateResult:
    """Keep confirmed-period lessons untouched and regenerate every other class lesson."""
    preserved = tuple(
        lesson
        for lesson in existing_lessons
        if lesson.class_id == updated_class.id and get_payment_date(lesson.lesson_date) in received_payment_dates
    )
    preserved_ids = {lesson.id for lesson in preserved}
    recalculated: list[LessonData] = []
    for lesson in generate_lessons_for_class(updated_class):
        if get_payment_date(lesson.lesson_date) in received_payment_dates:
            continue
        if lesson.id in preserved_ids:
            lesson = replace(lesson, id=f"{lesson.class_id}-lesson-{lesson.number}-{lesson.lesson_date.isoformat()}")
        recalculated.append(lesson)
    result = (*preserved, *recalculated)
    if len({lesson.id for lesson in result}) != len(result):
        raise ValueError("class update produced duplicate lesson ids")
    return ClassUpdateResult(preserved, tuple(recalculated), result)


def deactivate_class_lessons(
    class_id: str,
    existing_lessons: Iterable[LessonData],
    received_payment_dates: set[date],
) -> tuple[LessonData, ...]:
    """Cancel only unreceived lessons belonging to the selected class.

    Extra lessons have no matching class id and are consequently always retained.
    """
    return tuple(
        lesson
        if lesson.class_id != class_id or get_payment_date(lesson.lesson_date) in received_payment_dates
        else replace(lesson, active=False, canceled=True)
        for lesson in existing_lessons
    )
