from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.core.config import get_settings
from app.main import app
from app.models import User


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
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
    app.state.auth_test_session = test_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    del app.state.auth_test_session
    Base.metadata.drop_all(engine)


def register(client: TestClient, email: str, name: str = "Professora") -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"name": name, "email": email, "password": "a-strong-password"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_registration_hashes_password_and_sets_secure_session_cookie(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Professora", "email": "professor@example.com", "password": "a-strong-password"},
    )
    assert response.status_code == 201
    user_payload = response.json()
    cookie = client.cookies.get("aulapay_session")

    assert cookie
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    assert user_payload["email"] == "professor@example.com"
    with app.state.auth_test_session() as db:
        stored_user = db.query(User).filter_by(email="professor@example.com").one()
    assert stored_user.password_hash != "a-strong-password"
    assert stored_user.password_hash.startswith("$2")


def test_login_and_current_user_require_valid_session(client: TestClient) -> None:
    registered = register(client, "owner@example.com")
    client.post("/api/v1/auth/logout")
    assert client.get("/api/v1/users/me").status_code == 401

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "a-strong-password"},
    )
    assert login.status_code == 200
    assert client.get("/api/v1/users/me").json()["id"] == registered["id"]


def test_production_login_sets_cross_site_secure_cookie(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    register(client, "production@example.com")
    client.post("/api/v1/auth/logout")
    monkeypatch.setattr(get_settings(), "app_env", "production")

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "production@example.com", "password": "a-strong-password"},
    )

    assert response.status_code == 200
    assert "Secure" in response.headers["set-cookie"]
    assert "SameSite=none" in response.headers["set-cookie"]


def test_each_session_only_exposes_its_own_user(client: TestClient) -> None:
    first = register(client, "first@example.com", "First")
    first_cookie = client.cookies.get("aulapay_session")
    client.post("/api/v1/auth/logout")
    second = register(client, "second@example.com", "Second")

    assert client.get("/api/v1/users/me").json()["id"] == second["id"]
    client.cookies.set("aulapay_session", first_cookie)
    assert client.get("/api/v1/users/me").json()["id"] == first["id"]


def test_invalid_login_does_not_create_a_session(client: TestClient) -> None:
    register(client, "owner@example.com")
    client.post("/api/v1/auth/logout")
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "incorrect-password"},
    )
    assert response.status_code == 401
    assert client.get("/api/v1/users/me").status_code == 401


def test_cors_allows_only_configured_frontend_origin(client: TestClient) -> None:
    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"
