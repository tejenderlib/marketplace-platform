"""Reusable catalog authorization helpers (ownership + ADMIN privilege)."""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.identity.dependencies import require_active_user
from app.identity.models import Role, RoleName, User, UserRole
from app.catalog.models import Listing


def is_admin(db: Session, user: User) -> bool:
    """ADMIN privilege comes from backend role rows, never the frontend."""

    return (
        db.scalars(
            select(Role.id)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user.id, Role.name == RoleName.ADMIN)
        ).first()
        is not None
    )


def get_listing_or_404(listing_id: uuid.UUID, db: Session = Depends(get_db_session)) -> Listing:
    """Fetch a listing or raise 404. Reusable across catalog endpoints."""

    listing = db.get(Listing, listing_id)
    if listing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )
    return listing


def require_listing_owner_or_admin(
    listing: Listing = Depends(get_listing_or_404),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> Listing:
    """Allow the listing owner; ADMIN is a separate privileged path.

    Requires a fully ACTIVE account: an unverified seller cannot manage
    listings even if it somehow owns rows.
    """

    if listing.seller_id != user.id and not is_admin(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the listing owner or an admin may modify this listing.",
        )
    return listing
