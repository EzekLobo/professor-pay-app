from __future__ import annotations

from datetime import date, time
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Integer, String, Time, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.lesson import Lesson
    from app.models.user import User


class ClassRecord(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "classes"
    __table_args__ = (
        CheckConstraint("week_day BETWEEN 0 AND 6", name="ck_classes_week_day"),
        CheckConstraint("lesson_count > 0", name="ck_classes_lesson_count"),
        CheckConstraint("duration_minutes > 0", name="ck_classes_duration_minutes"),
        CheckConstraint("hourly_rate_cents >= 0", name="ck_classes_hourly_rate_cents"),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    week_day: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    first_lesson_date: Mapped[date] = mapped_column(Date, nullable=False)
    lesson_count: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    hourly_rate_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    user: Mapped[User] = relationship(back_populates="classes")
    lessons: Mapped[list[Lesson]] = relationship(back_populates="class_record")
