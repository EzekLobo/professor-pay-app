import json
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import ClassRecord, ImportRecord, Lesson, PaymentConfirmation


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

    def override_get_db() -> Generator[Session, None, None]:
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.state.import_test_session = test_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    del app.state.import_test_session
    Base.metadata.drop_all(engine)


def register(client: TestClient) -> None:
    response = client.post("/api/v1/auth/register", json={"name": "Professora", "email": "import@example.com", "password": "a-strong-password"})
    assert response.status_code == 201, response.text


def fixture_payload() -> dict[str, object]:
    path = Path(__file__).parent / "fixtures" / "expo_export.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_expo_export_preview_imports_once_and_reports_totals(client: TestClient) -> None:
    register(client)
    payload = fixture_payload()
    preview = client.post("/api/v1/data/import/preview", json=payload)
    assert preview.status_code == 200, preview.text
    assert preview.json() == {
        "export_id": "expo-fixture-2026-09-28", "already_imported": False,
        "class_count": 1, "lesson_count": 2, "payment_confirmation_count": 1,
        "total_cents": 8500, "imported_at": None,
    }

    first = client.post("/api/v1/data/import", json=payload)
    assert first.status_code == 200, first.text
    assert first.json()["already_imported"] is False
    assert first.json()["imported_at"]
    repeated = client.post("/api/v1/data/import", json=payload)
    assert repeated.status_code == 200
    assert repeated.json()["already_imported"] is True
    with app.state.import_test_session() as db:
        assert db.query(ClassRecord).count() == 1
        assert db.query(Lesson).count() == 2
        assert db.query(PaymentConfirmation).count() == 1
        assert db.query(ImportRecord).count() == 1
        assert db.query(ClassRecord).one().duration_minutes == 90
        assert db.query(Lesson).filter_by(student="Ana").one().hourly_rate_cents == 4000

    preview_after = client.post("/api/v1/data/import/preview", json=payload)
    assert preview_after.json()["already_imported"] is True


def test_invalid_export_is_rejected_without_partial_write(client: TestClient) -> None:
    register(client)
    payload = fixture_payload()
    payload["lessons"][0]["classId"] = "missing-class"  # type: ignore[index]
    response = client.post("/api/v1/data/import", json=payload)
    assert response.status_code == 422
    with app.state.import_test_session() as db:
        assert db.query(ClassRecord).count() == 0
        assert db.query(Lesson).count() == 0
        assert db.query(PaymentConfirmation).count() == 0
        assert db.query(ImportRecord).count() == 0
