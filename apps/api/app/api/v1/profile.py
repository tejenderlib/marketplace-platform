"""Owner-only profile self-service (existing user_profiles fields only)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.auth import _user_response
from app.catalog.models import Listing, ListingStatus
from app.db.session import get_db_session
from app.identity.dependencies import require_active_user, require_authenticated_user
from app.identity.models import User, UserProfile, UserStatus
from app.identity.schemas import ProfileUpdate, PublicUserProfile, UserResponse

router = APIRouter(prefix="/users", tags=["profile"])


@router.patch("/me/profile", response_model=UserResponse)
def update_own_profile(
    payload: ProfileUpdate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> UserResponse:
    """Edit the caller's own profile. Creates the row if missing.

    Only existing columns are writable; any other keys are ignored.
    Empty strings clear nullable fields. No user_id is accepted — the
    target is always the Bearer-authenticated user.
    """

    data = payload.model_dump(exclude_unset=True)
    cleaned: dict[str, str | None] = {}
    for field in ("display_name", "avatar_key"):
        if field not in data:
            continue
        value = data[field]
        if value is None:
            cleaned[field] = None
            continue
        cleaned[field] = value.strip()

    profile = db.scalars(
        select(UserProfile).where(UserProfile.user_id == user.id)
    ).first()
    if profile is None:
        profile = UserProfile(user_id=user.id)
        db.add(profile)
        db.flush()
    for field, value in cleaned.items():
        if field == "avatar_key":
            profile.avatar_url = value
        else:
            setattr(profile, field, value)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Profile data violates database constraints.",
        ) from error
    db.refresh(profile)
    return _user_response(db, user)


@router.get("/{user_id}/public-profile", response_model=PublicUserProfile)
def public_profile(
    user_id: uuid.UUID,
    db: Session = Depends(get_db_session),
) -> PublicUserProfile:
    """Public read-only profile. Never exposes email, roles, or status.

    Returns 404 for unknown, SUSPENDED, or DELETED users.
    Location is derived from the seller's most recent ACTIVE listing.
    """

    user = db.scalars(select(User).where(User.id == user_id)).first()
    if user is None or user.status in (UserStatus.SUSPENDED, UserStatus.DELETED):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found."
        )

    profile = db.scalars(
        select(UserProfile).where(UserProfile.user_id == user.id)
    ).first()

    latest = db.scalars(
        select(Listing)
        .where(
            Listing.seller_id == user.id,
            Listing.status == ListingStatus.ACTIVE,
        )
        .order_by(Listing.created_at.desc(), Listing.id.desc())
        .limit(1)
    ).first()

    active_count = db.scalar(
        select(func.count())
        .select_from(Listing)
        .where(
            Listing.seller_id == user.id,
            Listing.status == ListingStatus.ACTIVE,
        )
    )

    location = None
    if latest is not None:
        location = ", ".join(filter(None, (latest.city, latest.region))) or None

    return PublicUserProfile(
        id=user.id,
        display_name=profile.display_name if profile else None,
        avatar_url=profile.avatar_url if profile else None,
        location=location,
        active_listings_count=int(active_count or 0),
    )
