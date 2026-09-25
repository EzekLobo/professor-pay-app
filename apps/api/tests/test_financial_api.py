from collections.abc import Generator
from datetime import date, datetime, timezone
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import PaymentConfirmation


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

    def override_get_db() -> Generator[Session, None, None]:
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.state.financial_test_session = test_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    del app.state.financial_test_session
    Base.metadata.drop_all(engine)


def register(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Professora", "email": email, "password": "a-strong-password"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_class(client: TestClient, **overrides: object) -> dict[str, object]:
    payload = {
        "name": "Matemática", "week_day": 2, "start_time": "09:30:00",
        "first_lesson_date": "2026-01-07", "lesson_count": 3,
        "duration_minutes": 60, "hourly_rate_cents": 10000,
    }
    payload.update(overrides)
    response = client.post("/api/v1/classes", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_classes_create_update_and_deactivate_are_transactional(client: TestClient) -> None:
    register(client, "owner@example.com")
    class_record = create_class(client)
    initial_lessons = client.get("/api/v1/lessons", params={"as_of": "2026-01-01"}).json()
    assert initial_lessons["total"] == 3

    updated = client.patch(
        f"/api/v1/classes/{class_record['id']}",
        json={"name": "Álgebra", "lesson_count": 2, "hourly_rate_cents": 12500},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Álgebra"
    after_update = client.get("/api/v1/lessons", params={"as_of": "2026-01-01"}).json()
    assert after_update["total"] == 2
    assert {item["class_name_snapshot"] for item in after_update["items"]} == {"Álgebra"}
    assert {item["hourly_rate_cents"] for item in after_update["items"]} == {12500}

    # A rejected request changes neither the class nor its generated lessons.
    rejected = client.patch(f"/api/v1/classes/{class_record['id']}", json={"lesson_count": 0})
    assert rejected.status_code == 422
    assert client.get("/api/v1/lessons").json()["total"] == 2

    deactivated = client.post(f"/api/v1/classes/{class_record['id']}/deactivate")
    assert deactivated.status_code == 200
    assert deactivated.json()["active"] is False
    canceled = client.get("/api/v1/lessons", params={"status": "CANCELED"}).json()
    assert canceled["total"] == 2


def test_class_edit_and_deactivation_preserve_received_periods(client: TestClient) -> None:
    owner = register(client, "owner@example.com")
    class_record = create_class(client, lesson_count=2, first_lesson_date="2026-01-07")
    with app.state.financial_test_session() as db:
        db.add(
            PaymentConfirmation(
                user_id=UUID(owner["id"]), payment_date=date(2026, 2, 1),
                received_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
            )
        )
        db.commit()

    response = client.patch(
        f"/api/v1/classes/{class_record['id']}",
        json={"name": "Novo nome", "hourly_rate_cents": 20000},
    )
    assert response.status_code == 200
    lessons = client.get("/api/v1/lessons", params={"as_of": "2026-02-02"}).json()["items"]
    assert len(lessons) == 2
    assert {item["class_name_snapshot"] for item in lessons} == {"Matemática"}
    assert {item["hourly_rate_cents"] for item in lessons} == {10000}

    assert client.post(f"/api/v1/classes/{class_record['id']}/deactivate").status_code == 200
    assert client.get("/api/v1/lessons", params={"status": "CANCELED"}).json()["total"] == 0


def test_lesson_filters_extra_cancel_and_dashboard(client: TestClient) -> None:
    register(client, "owner@example.com")
    create_class(client, lesson_count=1, first_lesson_date="2026-01-07")
    extra = client.post(
        "/api/v1/lessons/extras",
        json={"student": "Ana", "lesson_date": "2026-01-20", "duration_minutes": 90,
              "hourly_rate_cents": 10000, "note": "Reposição"},
    )
    assert extra.status_code == 201
    extra_id = extra.json()["id"]

    filtered = client.get("/api/v1/lessons", params={"type": "EXTRA", "from": "2026-01-15", "to": "2026-01-31", "as_of": "2026-01-21"})
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["value_cents"] == 15000
    assert filtered.json()["items"][0]["status"] == "COMPLETED"

    assert client.post(f"/api/v1/lessons/{extra_id}/cancel").status_code == 200
    assert client.get("/api/v1/lessons", params={"status": "CANCELED"}).json()["total"] == 1
    dashboard = client.get("/api/v1/dashboard", params={"as_of": "2026-01-21"})
    assert dashboard.status_code == 200
    assert dashboard.json()["total_lessons"] == 1
    assert dashboard.json()["earned_cents"] == 10000
    assert dashboard.json()["normal_lessons"] == 1


def test_resources_are_isolated_between_users(client: TestClient) -> None:
    register(client, "first@example.com")
    class_record = create_class(client)
    lesson_id = client.get("/api/v1/lessons").json()["items"][0]["id"]
    client.post("/api/v1/auth/logout")
    register(client, "second@example.com")

    assert client.get(f"/api/v1/classes/{class_record['id']}").status_code == 404
    assert client.patch(f"/api/v1/classes/{class_record['id']}", json={"name": "Roubo"}).status_code == 404
    assert client.post(f"/api/v1/lessons/{lesson_id}/cancel").status_code == 404
    assert client.get("/api/v1/classes").json()["total"] == 0
    assert client.get("/api/v1/dashboard").json()["total_lessons"] == 0


def test_openapi_documents_financial_endpoints(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v1/classes" in paths
    assert "/api/v1/lessons/extras" in paths
    assert "/api/v1/dashboard" in paths
