from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ExpoModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class ExpoClass(ExpoModel):
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=160)
    week_day: str = Field(alias="weekDay", min_length=1, max_length=32)
    start_time: time = Field(alias="time")
    first_lesson_date: date = Field(alias="firstLesson")
    lesson_count: int = Field(alias="lessonCount", ge=1)
    duration_hours: float = Field(alias="durationHours", gt=0, le=24)
    hourly_rate: float = Field(alias="hourlyRate", ge=0, le=1_000_000)
    active: bool
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class ExpoLesson(ExpoModel):
    id: str = Field(min_length=1, max_length=128)
    class_id: str | None = Field(alias="classId", default=None, max_length=128)
    class_name: str = Field(alias="className", min_length=1, max_length=160)
    number: int = Field(ge=1)
    lesson_date: date = Field(alias="lessonDate")
    student: str = Field(max_length=255)
    type: Literal["Normal", "Extra"]
    duration_hours: float = Field(alias="durationHours", gt=0, le=24)
    hourly_rate: float = Field(alias="hourlyRate", ge=0, le=1_000_000)
    active: bool
    canceled: bool
    note: str = Field(max_length=1000)


class ExpoPaymentConfirmation(ExpoModel):
    id: str = Field(min_length=1, max_length=128)
    payment_date: date = Field(alias="paymentDate")
    received_at: datetime = Field(alias="receivedAt")
    note: str = Field(max_length=1000)


class AulaPayExport(ExpoModel):
    # These fields intentionally use the Expo JSON names. FastAPI recreates top-level
    # Pydantic fields while parsing request bodies; carrying an alias there produces
    # UnsupportedFieldAttributeWarning with the pinned FastAPI/Pydantic versions.
    schemaVersion: Literal["1.0"]
    exportId: str = Field(min_length=1, max_length=128)
    exportedAt: datetime
    classes: list[ExpoClass]
    lessons: list[ExpoLesson]
    paymentConfirmations: list[ExpoPaymentConfirmation]

    @property
    def schema_version(self) -> Literal["1.0"]:
        return self.schemaVersion

    @property
    def export_id(self) -> str:
        return self.exportId

    @property
    def exported_at(self) -> datetime:
        return self.exportedAt

    @property
    def payment_confirmations(self) -> list[ExpoPaymentConfirmation]:
        return self.paymentConfirmations

    @field_validator("exportId")
    @classmethod
    def export_id_is_safe(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("exportId cannot be blank")
        return value

    @model_validator(mode="after")
    def references_and_ids_are_unique(self) -> "AulaPayExport":
        def unique(values: list[str], label: str) -> None:
            if len(values) != len(set(values)):
                raise ValueError(f"Duplicate {label} IDs are not allowed")

        unique([item.id for item in self.classes], "class")
        unique([item.id for item in self.lessons], "lesson")
        unique([item.id for item in self.paymentConfirmations], "payment confirmation")
        class_ids = {item.id for item in self.classes}
        if any(item.class_id is not None and item.class_id not in class_ids for item in self.lessons):
            raise ValueError("Every lesson classId must reference an exported class")
        return self


class ImportReport(BaseModel):
    export_id: str
    already_imported: bool
    class_count: int
    lesson_count: int
    payment_confirmation_count: int
    total_cents: int
    imported_at: datetime | None = None
