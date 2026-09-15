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


def get_current_user_id_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> uuid.UUID | None:
    """Subject id when a Bearer token is present; None when absent.

    A missing Authorization header is a valid anonymous request. An
    explicitly presented but invalid/expired token still raises 401 so
    broken clients are not silently treated as anonymous.
    """

    if credentials is None or not credentials.credentials:
        return None
    try:
        return decode_access_token(credentials.credentials)
    except TokenError as error:
        raise _unauthorized(str(error)) from error


def get_optional_current_user(
    user_id: uuid.UUID | None = Depends(get_current_user_id_optional),
    db: Session = Depends(get_db_session),
) -> User | None:
    """Bearer user when a valid token is present; anonymous stays None.

    For endpoints that serve both public and authenticated traffic with
    per-viewer rules (e.g. listing visibility). Invalid/expired tokens
    still 401 — an explicit bad credential must not be silently ignored.
    Suspended/deleted bearers are also rejected rather than downgraded
    to anonymous.
    """

    if user_id is None:
        return None
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
    """Explicit alias requiring an authenticated, non-suspended user.

    PENDING_VERIFICATION accounts are accepted here so they can reach
    endpoints that must stay open to them (e.g. email verification,
    reading own notifications). Domain endpoints that represent real
    marketplace activity use ``require_active_user`` instead.
    """

    return user


def require_active_user(
    user: User = Depends(require_authenticated_user),
) -> User:
    """Require a fully ACTIVE account for marketplace functionality.

    PENDING_VERIFICATION holders get 403 with a pointer to verification.
    Suspended/deleted rejection already happened upstream.
    """

    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verify your email address before using marketplace features.",
        )
    return user
