from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, String, Uuid, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User


class PaymentConfirmation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "payment_confirmations"
    __table_args__ = (
        UniqueConstraint("user_id", "payment_date", name="uq_payment_confirmations_user_payment_date"),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    note: Mapped[str] = mapped_column(String(1000), nullable=False, default="", server_default="")

    user: Mapped[User] = relationship(back_populates="payment_confirmations")
