"""Owner-only profile self-service (existing user_profiles fields only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.auth import _user_response
from app.db.session import get_db_session
from app.identity.dependencies import require_authenticated_user
from app.identity.models import User, UserProfile
from app.identity.schemas import ProfileUpdate, UserResponse

router = APIRouter(prefix="/users", tags=["profile"])


@router.patch("/me/profile", response_model=UserResponse)
def update_own_profile(
    payload: ProfileUpdate,
    user: User = Depends(require_authenticated_user),
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
