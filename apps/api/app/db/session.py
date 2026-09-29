from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


def _make_engine(database_url: str):
    if database_url.startswith("sqlite"):
        database_path = make_url(database_url).database
        # The default database lives in a directory tracked without its data
        # file.  Custom SQLite URLs get the same convenient first-run setup.
        if database_path and database_path != ":memory:":
            Path(database_path).expanduser().parent.mkdir(parents=True, exist_ok=True)

        sqlite_engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False},
        )

        @event.listens_for(sqlite_engine, "connect")
        def configure_sqlite_connection(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA busy_timeout=5000")
            finally:
                cursor.close()

        return sqlite_engine

    return create_engine(database_url, pool_pre_ping=True)


engine = _make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """Yield a request-scoped database session."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
