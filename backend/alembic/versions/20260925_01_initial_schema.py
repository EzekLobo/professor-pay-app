"""Create the initial AulaPay schema.

Revision ID: 20260925_01
Revises:
Create Date: 2026-09-25 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260925_01"
down_revision = None
branch_labels = None
depends_on = None


lesson_type = sa.Enum("NORMAL", "EXTRA", name="lessontype", native_enum=False, create_constraint=True)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)
    op.create_table(
        "classes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("week_day", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("first_lesson_date", sa.Date(), nullable=False),
        sa.Column("lesson_count", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("hourly_rate_cents", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("week_day BETWEEN 0 AND 6", name="ck_classes_week_day"),
        sa.CheckConstraint("lesson_count > 0", name="ck_classes_lesson_count"),
        sa.CheckConstraint("duration_minutes > 0", name="ck_classes_duration_minutes"),
        sa.CheckConstraint("hourly_rate_cents >= 0", name="ck_classes_hourly_rate_cents"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_classes_user_id"), "classes", ["user_id"], unique=False)
    op.create_table(
        "lessons",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("class_id", sa.Uuid(), nullable=True),
        sa.Column("class_name_snapshot", sa.String(length=160), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("lesson_date", sa.Date(), nullable=False),
        sa.Column("student", sa.String(length=255), nullable=False),
        sa.Column("type", lesson_type, nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("hourly_rate_cents", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("canceled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("note", sa.String(length=1000), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("number > 0", name="ck_lessons_number"),
        sa.CheckConstraint("duration_minutes > 0", name="ck_lessons_duration_minutes"),
        sa.CheckConstraint("hourly_rate_cents >= 0", name="ck_lessons_hourly_rate_cents"),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_lessons_class_id"), "lessons", ["class_id"], unique=False)
    op.create_index(op.f("ix_lessons_lesson_date"), "lessons", ["lesson_date"], unique=False)
    op.create_index(op.f("ix_lessons_user_id"), "lessons", ["user_id"], unique=False)
    op.create_table(
        "payment_confirmations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.String(length=1000), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "payment_date", name="uq_payment_confirmations_user_payment_date"),
    )
    op.create_index(op.f("ix_payment_confirmations_user_id"), "payment_confirmations", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_payment_confirmations_user_id"), table_name="payment_confirmations")
    op.drop_table("payment_confirmations")
    op.drop_index(op.f("ix_lessons_user_id"), table_name="lessons")
    op.drop_index(op.f("ix_lessons_lesson_date"), table_name="lessons")
    op.drop_index(op.f("ix_lessons_class_id"), table_name="lessons")
    op.drop_table("lessons")
    op.drop_index(op.f("ix_classes_user_id"), table_name="classes")
    op.drop_table("classes")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
