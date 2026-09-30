from __future__ import annotations

from datetime import date
from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Date, Enum as SqlEnum, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.class_record import ClassRecord
    from app.models.user import User


class LessonType(str, Enum):
    NORMAL = "NORMAL"
    EXTRA = "EXTRA"


class Lesson(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "lessons"
    __table_args__ = (
        CheckConstraint("number > 0", name="ck_lessons_number"),
        CheckConstraint("duration_minutes > 0", name="ck_lessons_duration_minutes"),
        CheckConstraint("hourly_rate_cents >= 0", name="ck_lessons_hourly_rate_cents"),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    class_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("classes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    class_name_snapshot: Mapped[str] = mapped_column(String(160), nullable=False)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    lesson_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    student: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[LessonType] = mapped_column(
        SqlEnum(LessonType, native_enum=False, create_constraint=True), nullable=False
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    hourly_rate_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    canceled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    note: Mapped[str] = mapped_column(String(1000), nullable=False, default="", server_default="")

    user: Mapped[User] = relationship(back_populates="lessons")
    class_record: Mapped[ClassRecord | None] = relationship(back_populates="lessons")
