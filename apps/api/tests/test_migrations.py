from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_initial_migration_creates_schema_in_sqlite(tmp_path: Path) -> None:
    database_path = tmp_path / "aulapay.db"
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"
    config.attributes["database_url"] = database_url

    command.upgrade(config, "head")

    inspector = inspect(create_engine(database_url))
    assert {"users", "classes", "lessons", "payment_confirmations"} <= set(inspector.get_table_names())
    assert {column["name"] for column in inspector.get_columns("lessons")} >= {
        "user_id",
        "duration_minutes",
        "hourly_rate_cents",
    }
