"""Reusable FastAPI authentication dependencies for current and future APIs."""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.identity.models import User, UserStatus
from app.identity.security import TokenError, decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized(detail: str = "Not authenticated.") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> uuid.UUID:
    """Extract and validate the Bearer access token, returning the subject id."""

    if credentials is None or not credentials.credentials:
        raise _unauthorized()
    try:
        return decode_access_token(credentials.credentials)
    except TokenError as error:
        raise _unauthorized(str(error)) from error


def get_current_user(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> User:
    """Resolve the Bearer-authenticated user. Reusable for Catalog APIs."""

    user = db.get(User, user_id)
    if user is None:
        raise _unauthorized("Not authenticated.")
    if user.status in (UserStatus.SUSPENDED, UserStatus.DELETED):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not allowed to authenticate.",
        )
    return user


def require_authenticated_user(
    user: User = Depends(get_current_user),
) -> User:
    """Explicit alias requiring an authenticated, non-suspended user."""

    return user
