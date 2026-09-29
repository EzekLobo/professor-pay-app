from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.session import _make_engine
from app.main import app


API_ROOT = Path(__file__).parents[1]


def migration_config(database_path: Path) -> tuple[Config, str]:
    """Point Alembic at an isolated SQLite *file*, as production does."""
    database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"
    config = Config(str(API_ROOT / "alembic.ini"))
    config.attributes["database_url"] = database_url
    return config, database_url


def test_initial_migration_creates_schema_in_sqlite(tmp_path: Path) -> None:
    database_path = tmp_path / "aulapay.db"
    config, database_url = migration_config(database_path)

    command.upgrade(config, "head")

    engine = _make_engine(database_url)
    inspector = inspect(engine)
    assert database_path.is_file()
    assert {
        "alembic_version",
        "users",
        "classes",
        "lessons",
        "payment_confirmations",
        "import_records",
    } <= set(inspector.get_table_names())
    assert {column["name"] for column in inspector.get_columns("lessons")} >= {
        "user_id",
        "duration_minutes",
        "hourly_rate_cents",
    }
    assert {foreign_key["referred_table"] for foreign_key in inspector.get_foreign_keys("import_records")} == {
        "users"
    }
    assert {
        tuple(constraint["column_names"])
        for constraint in inspector.get_unique_constraints("import_records")
    } >= {("user_id", "export_id")}

    # SQLite only enforces foreign keys when the connection pragma is enabled.
    # The application engine must therefore reject orphan import records.
    with engine.begin() as connection, pytest.raises(IntegrityError):
        connection.execute(
            text(
                """
                INSERT INTO import_records (
                    id, user_id, export_id, exported_at, imported_at,
                    class_count, lesson_count, payment_confirmation_count, total_cents
                ) VALUES (
                    :id, :user_id, :export_id, :exported_at, :imported_at,
                    0, 0, 0, 0
                )
                """
            ),
            {
                "id": "1" * 32,
                "user_id": "2" * 32,
                "export_id": "orphan-export",
                "exported_at": "2026-09-29 12:00:00",
                "imported_at": "2026-09-29 12:00:00",
            },
        )
    engine.dispose()

    # A reinitialization must also work for a deployed file after an operator
    # intentionally rolls it back to the initial state.
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    verification_engine = _make_engine(database_url)
    try:
        assert "import_records" in inspect(verification_engine).get_table_names()
    finally:
        verification_engine.dispose()


def test_ready_responds_after_migrating_sqlite_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    database_path = tmp_path / "ready" / "aulapay.sqlite3"
    config, database_url = migration_config(database_path)
    command.upgrade(config, "head")

    engine = _make_engine(database_url)
    test_session = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    monkeypatch.setattr("app.db.session.SessionLocal", test_session)
    try:
        with TestClient(app) as client:
            response = client.get("/ready")
        assert response.status_code == 200
        assert response.json() == {"status": "ready"}
    finally:
        engine.dispose()
