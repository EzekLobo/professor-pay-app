from pathlib import Path

from sqlalchemy import text

from app.core.config import DEFAULT_DATABASE_URL, DEFAULT_SQLITE_PATH, Settings
from app.db.session import _make_engine


def test_sqlite_database_is_the_portable_default() -> None:
    settings = Settings()

    assert settings.database_url == DEFAULT_DATABASE_URL
    assert DEFAULT_SQLITE_PATH.is_absolute()
    assert DEFAULT_SQLITE_PATH == Path(__file__).parents[1] / "data" / "aulapay.sqlite3"


def test_database_url_can_be_overridden_for_postgresql() -> None:
    postgres_url = "postgresql+psycopg://user:password@localhost:5432/aulapay"

    assert Settings(database_url=postgres_url).database_url == postgres_url


def test_sqlite_engine_enables_required_pragmas(tmp_path: Path) -> None:
    database_path = tmp_path / "nested" / "aulapay.sqlite3"
    engine = _make_engine(f"sqlite+pysqlite:///{database_path.as_posix()}")
    try:
        with engine.connect() as connection:
            assert connection.execute(text("PRAGMA foreign_keys")).scalar_one() == 1
            assert connection.execute(text("PRAGMA busy_timeout")).scalar_one() == 5000
    finally:
        engine.dispose()
