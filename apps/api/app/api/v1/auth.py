"""Authentication endpoints built on the Phase 2A identity tables."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db_session
from app.identity.dependencies import require_authenticated_user
from app.identity.models import (
    AuthRefreshToken,
    RefreshTokenStatus,
    Role,
    RoleName,
    User,
    UserProfile,
    UserRole,
    UserStatus,
)
from app.identity.schemas import (
    LoginRequest,
    LogoutRequest,
    ProfileResponse,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.identity.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    normalize_email,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_INVALID_CREDENTIALS = "Invalid email or password."
_LOGIN_ALLOWED_STATUSES = (UserStatus.PENDING_VERIFICATION, UserStatus.ACTIVE)


def _user_response(db: Session, user: User) -> UserResponse:
    role_names = sorted(
        db.scalars(
            select(Role.name).join(UserRole, UserRole.role_id == Role.id).where(
                UserRole.user_id == user.id
            )
        ).all()
    )
    profile = db.scalars(
        select(UserProfile).where(UserProfile.user_id == user.id)
    ).first()
    return UserResponse(
        id=user.id,
        email=user.email,
        status=user.status.value,
        email_verified_at=user.email_verified_at,
        roles=[name.value for name in role_names],
        profile=(
            ProfileResponse(
                display_name=profile.display_name,
                first_name=profile.first_name,
                last_name=profile.last_name,
                avatar_url=profile.avatar_url,
                bio=profile.bio,
            )
            if profile is not None
            else None
        ),
        created_at=user.created_at,
    )


def _issue_refresh_token(db: Session, user: User) -> str:
    """Create an ACTIVE refresh-token row; return the raw token once."""

    settings = get_settings()
    raw_token = generate_refresh_token()
    db.add(
        AuthRefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_token),
            status=RefreshTokenStatus.ACTIVE,
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.jwt_refresh_token_expire_days),
        )
    )
    return raw_token


def _get_active_refresh_token(
    db: Session, raw_token: str
) -> AuthRefreshToken | None:
    """Look up a refresh token by its hash; lazily expire past-due rows."""

    record = db.scalars(
        select(AuthRefreshToken).where(
            AuthRefreshToken.token_hash == hash_refresh_token(raw_token)
        )
    ).first()
    if record is None:
        return None
    if record.status == RefreshTokenStatus.REVOKED:
        return None
    if record.expires_at <= datetime.now(timezone.utc):
        record.status = RefreshTokenStatus.EXPIRED
        db.commit()
        return None
    if record.status != RefreshTokenStatus.ACTIVE:
        return None
    return record


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db_session)) -> UserResponse:
    """Create a user with the default BUYER role and an optional profile."""

    email = normalize_email(payload.email)
    existing = db.scalars(select(User).where(User.email == email)).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(email=email, password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()

    buyer_role = db.scalars(
        select(Role).where(Role.name == RoleName.BUYER)
    ).first()
    if buyer_role is None:  # pragma: no cover - static seed data is required
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Role catalogue is not seeded.",
        )
    db.add(UserRole(user_id=user.id, role_id=buyer_role.id))
    if payload.display_name is not None:
        db.add(UserProfile(user_id=user.id, display_name=payload.display_name))
    db.commit()
    db.refresh(user)
    return _user_response(db, user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db_session)) -> TokenResponse:
    """Verify credentials and issue access + refresh tokens (generic 401)."""

    email = normalize_email(payload.email)
    user = db.scalars(select(User).where(User.email == email)).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=_INVALID_CREDENTIALS
        )
    if user.status not in _LOGIN_ALLOWED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not allowed to authenticate.",
        )

    access_token, expires_in = create_access_token(user.id)
    refresh_token = _issue_refresh_token(db, user)
    db.commit()
    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
        refresh_token=refresh_token,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db_session)) -> TokenResponse:
    """Exchange a valid refresh token for a new access token."""

    record = _get_active_refresh_token(db, payload.refresh_token)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired.",
        )
    user = db.get(User, record.user_id)
    if user is None or user.status not in _LOGIN_ALLOWED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not allowed to authenticate.",
        )

    record.last_used_at = datetime.now(timezone.utc)
    access_token, expires_in = create_access_token(user.id)
    db.commit()
    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
        refresh_token=payload.refresh_token,
    )


@router.get("/me", response_model=UserResponse)
def read_current_user(
    user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db_session),
) -> UserResponse:
    """Return the Bearer-authenticated user's safe representation."""

    return _user_response(db, user)


@router.post("/logout")
def logout(
    payload: LogoutRequest,
    user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db_session),
) -> dict[str, str]:
    """Revoke the caller's refresh token. The user record is untouched."""

    record = db.scalars(
        select(AuthRefreshToken).where(
            AuthRefreshToken.token_hash == hash_refresh_token(payload.refresh_token),
            AuthRefreshToken.user_id == user.id,
        )
    ).first()
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Refresh token not found."
        )
    if record.status != RefreshTokenStatus.REVOKED:
        record.status = RefreshTokenStatus.REVOKED
        record.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return {"status": "logged_out"}
