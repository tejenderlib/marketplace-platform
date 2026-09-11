"""Reusable ADMIN authorization: database-verified role, never client claims."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.catalog.dependencies import is_admin
from app.db.session import get_db_session
from app.identity.dependencies import require_authenticated_user
from app.identity.models import User


def require_admin_user(
    user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db_session),
) -> User:
    """Require a non-suspended ADMIN. Reusable across all admin endpoints.

    Authentication (401) and suspended/deleted rejection (403) come from
    ``require_authenticated_user``; the ADMIN role itself is read from
    ``user_roles`` rows. BUYER/SELLER holders get 403. No frontend check
    is trusted and no new role table exists.
    """

    if not is_admin(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required.",
        )
    return user
