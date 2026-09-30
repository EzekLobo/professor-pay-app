from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, SESSION_COOKIE_NAME
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserResponse

router = APIRouter(prefix="/api/v1", tags=["authentication"])
DbSession = Annotated[Session, Depends(get_db)]


def normalize_email(email: str) -> str:
    return email.strip().lower()


def set_session_cookie(response: Response, user: User) -> None:
    settings = get_settings()
    # The production frontend (Vercel) and API (PythonAnywhere) use distinct
    # sites.  Credentialed cross-origin requests therefore need a secure,
    # third-party cookie; localhost keeps the stricter development default.
    same_site = "none" if settings.cookie_secure else "lax"
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=create_access_token(user.id),
        httponly=True,
        secure=settings.cookie_secure,
        samesite=same_site,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )


@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, db: DbSession) -> User:
    if not get_settings().is_registration_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registration is disabled")
    user = User(
        name=payload.name.strip(),
        email=normalize_email(str(payload.email)),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered") from None
    db.refresh(user)
    set_session_cookie(response, user)
    return user


@router.post("/auth/login", response_model=UserResponse)
def login(payload: LoginRequest, response: Response, db: DbSession) -> User:
    user = db.scalar(select(User).where(User.email == normalize_email(str(payload.email))))
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    set_session_cookie(response, user)
    return user


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> Response:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/", httponly=True, samesite="lax")
    return response


@router.get("/users/me", response_model=UserResponse)
def get_me(current_user: CurrentUser) -> User:
    return current_user
