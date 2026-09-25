"""Pure financial rules used by API services.

This package deliberately has no FastAPI or database-session dependency.
"""

from app.domain.financial import (
    ClassData,
    Dashboard,
    LessonData,
    LessonType,
    build_dashboard,
    generate_lessons_for_class,
    get_lesson_value_cents,
    get_payment_date,
    get_period,
)
from app.domain.class_editing import deactivate_class_lessons, lessons_for_class_update

__all__ = [
    "ClassData",
    "Dashboard",
    "LessonData",
    "LessonType",
    "build_dashboard",
    "deactivate_class_lessons",
    "generate_lessons_for_class",
    "get_lesson_value_cents",
    "get_payment_date",
    "get_period",
    "lessons_for_class_update",
]
