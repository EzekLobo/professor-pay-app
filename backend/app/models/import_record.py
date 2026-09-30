from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Uuid, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User


class ImportRecord(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """An accepted mobile export, used as the idempotency boundary."""

    __tablename__ = "import_records"
    __table_args__ = (UniqueConstraint("user_id", "export_id", name="uq_import_records_user_export_id"),)

    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    export_id: Mapped[str] = mapped_column(String(128), nullable=False)
    exported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    class_count: Mapped[int] = mapped_column(Integer, nullable=False)
    lesson_count: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_confirmation_count: Mapped[int] = mapped_column(Integer, nullable=False)
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False)

    user: Mapped[User] = relationship(back_populates="import_records")
