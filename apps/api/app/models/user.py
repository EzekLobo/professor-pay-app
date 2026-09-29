from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.class_record import ClassRecord
    from app.models.import_record import ImportRecord
    from app.models.lesson import Lesson
    from app.models.payment_confirmation import PaymentConfirmation


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    classes: Mapped[list[ClassRecord]] = relationship(back_populates="user", cascade="all, delete-orphan")
    lessons: Mapped[list[Lesson]] = relationship(back_populates="user", cascade="all, delete-orphan")
    payment_confirmations: Mapped[list[PaymentConfirmation]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    import_records: Mapped[list[ImportRecord]] = relationship(back_populates="user", cascade="all, delete-orphan")
