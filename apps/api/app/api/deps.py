from typing import Annotated, TypeVar

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User

SESSION_COOKIE_NAME = "aulapay_session"


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> User:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        user_id = decode_access_token(session_token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session") from None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]

OwnedModel = TypeVar("OwnedModel")


def get_owned_or_404(db: Session, model: type[OwnedModel], record_id: object, user_id: object) -> OwnedModel:
    """Fetch a user-owned record without revealing records owned by someone else.

    Resource routers must use this helper (or an equivalent `user_id` filter) for
    single-record access. Returning 404 prevents ID enumeration across accounts.
    """
    record = db.get(model, record_id)
    if record is None or getattr(record, "user_id", None) != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
    return record
