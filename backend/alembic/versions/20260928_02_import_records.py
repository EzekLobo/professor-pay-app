"""Track idempotent mobile exports.

Revision ID: 20260928_02
Revises: 20260925_01
"""

from alembic import op
import sqlalchemy as sa

revision = "20260928_02"
down_revision = "20260925_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "import_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("export_id", sa.String(length=128), nullable=False),
        sa.Column("exported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("class_count", sa.Integer(), nullable=False),
        sa.Column("lesson_count", sa.Integer(), nullable=False),
        sa.Column("payment_confirmation_count", sa.Integer(), nullable=False),
        sa.Column("total_cents", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "export_id", name="uq_import_records_user_export_id"),
    )
    op.create_index(op.f("ix_import_records_user_id"), "import_records", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_import_records_user_id"), table_name="import_records")
    op.drop_table("import_records")
