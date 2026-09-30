from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.dashboard import DashboardPayment


class PaymentConfirmationRequest(BaseModel):
    """Optional note stored with a received payment."""

    note: str = Field(default="", max_length=1000)


class PaymentConfirmationResponse(BaseModel):
    payment: DashboardPayment
    received_at: datetime
    note: str


class PaymentListResponse(BaseModel):
    items: list[DashboardPayment]
    total: int


class PaymentDetailResponse(DashboardPayment):
    received_at: datetime | None = None
    confirmation_note: str | None = None
