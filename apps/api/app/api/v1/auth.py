"""Authentication endpoints built on the Phase 2A identity tables."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.rate_limit import RateLimiter
from app.db.session import get_db_session
from app.identity.dependencies import require_authenticated_user
from app.identity.models import (
    AccountActionPurpose,
    AccountActionStatus,
    AccountActionToken,
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
    ResendVerificationRequest,
    TokenResponse,
    UserResponse,
    VerifyEmailRequest,
)
from app.identity.security import (
    create_access_token,
    generate_refresh_token,
    generate_verification_token,
    hash_password,
    hash_refresh_token,
    hash_verification_token,
    normalize_email,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_INVALID_CREDENTIALS = "Invalid email or password."
_LOGIN_ALLOWED_STATUSES = (UserStatus.PENDING_VERIFICATION, UserStatus.ACTIVE)

# Email verification: raw token length after hashing (sha256 hex = 64).
_VERIFICATION_TOKEN_TTL_DAYS = 7
_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60

# In-process fixed-window limiters (single API instance in V1; swap the
# storage layer for Redis when scaling horizontally). Login failures are
# counted per source IP and per presented email independently: a burst of
# wrong passwords from one client trips the IP bucket, while distributed
# guessing against one account trips the email bucket. Successful logins
# never consume a slot and clear the email bucket. Registration is capped
# per IP. Keys use the normalized email so different casings of the same
# account share one bucket.
_settings = get_settings()
_WINDOW = _settings.auth_rate_limit_window_seconds
_LOGIN_IP_LIMITER = RateLimiter(
    limit=_settings.auth_login_rate_limit_per_ip, window_seconds=_WINDOW
)
_LOGIN_ACCOUNT_LIMITER = RateLimiter(
    limit=_settings.auth_login_rate_limit_per_account, window_seconds=_WINDOW
)
_REGISTER_IP_LIMITER = RateLimiter(
    limit=_settings.auth_register_rate_limit_per_ip, window_seconds=_WINDOW
)
_RATE_LIMITED_DETAIL = "Too many attempts. Please wait a minute and try again."


def _client_ip(request: Request) -> str:
    """Best-effort client IP for limiting (api is not behind a proxy in V1)."""

    client = request.client
    return client.host if client is not None else "unknown"


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


def _issue_refresh_token(
    db: Session, user: User, family_id: uuid.UUID | None = None
) -> str:
    """Create an ACTIVE refresh-token row; return the raw token once.

    ``family_id`` links a rotated token to the login chain it came from,
    enabling family-wide revocation when a rotated token is replayed.
    """

    settings = get_settings()
    raw_token = generate_refresh_token()
    db.add(
        AuthRefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_token),
            family_id=family_id if family_id is not None else uuid.uuid4(),
            status=RefreshTokenStatus.ACTIVE,
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.jwt_refresh_token_expire_days),
        )
    )
    return raw_token


def _find_refresh_token(
    db: Session, raw_token: str, for_update: bool = False
) -> AuthRefreshToken | None:
    """Look up a refresh-token row by its hash, whatever its status."""

    statement = select(AuthRefreshToken).where(
        AuthRefreshToken.token_hash == hash_refresh_token(raw_token)
    )
    if for_update:
        statement = statement.with_for_update()
    return db.scalars(statement).first()


def _revoke_family(db: Session, family_id: uuid.UUID) -> None:
    """Revoke every token in a family (reuse detected: assume theft)."""

    now = datetime.now(timezone.utc)
    db.execute(
        AuthRefreshToken.__table__.update()
        .where(
            AuthRefreshToken.family_id == family_id,
            AuthRefreshToken.status == RefreshTokenStatus.ACTIVE,
        )
        .values(
            status=RefreshTokenStatus.REVOKED,
            revoked_at=now,
        )
    )


def _enforce_session_cap(db: Session, user: User) -> None:
    """Keep at most ``max_active_refresh_tokens_per_user`` ACTIVE tokens.

    Called right before a new token is issued (login/refresh) with the
    user's token rows addressable; the oldest ACTIVE tokens beyond the
    cap are revoked so a long-running login storm cannot mint unlimited
    concurrent sessions. The new token itself is added afterwards, so
    the cap counts pre-existing sessions.
    """

    settings = get_settings()
    active = db.scalars(
        select(AuthRefreshToken)
        .where(
            AuthRefreshToken.user_id == user.id,
            AuthRefreshToken.status == RefreshTokenStatus.ACTIVE,
        )
        .order_by(AuthRefreshToken.created_at.asc(), AuthRefreshToken.id.asc())
    ).all()
    excess = len(active) - (settings.max_active_refresh_tokens_per_user - 1)
    if excess > 0:
        now = datetime.now(timezone.utc)
        for stale in active[:excess]:
            stale.status = RefreshTokenStatus.REVOKED
            stale.revoked_at = now


def _issue_verification_token(db: Session, user: User) -> str:
    """Create a PENDING EMAIL_VERIFICATION row; return the raw token once.

    Any previous PENDING verification token for the user is revoked
    first so only the newest one is redeemable. The raw value is only
    ever returned to the caller (no email infrastructure exists in V1);
    only its SHA-256 hash is persisted.
    """

    now = datetime.now(timezone.utc)
    db.execute(
        AccountActionToken.__table__.update()
        .where(
            AccountActionToken.user_id == user.id,
            AccountActionToken.purpose == AccountActionPurpose.EMAIL_VERIFICATION,
            AccountActionToken.status == AccountActionStatus.PENDING,
        )
        .values(status=AccountActionStatus.REVOKED)
    )
    raw = generate_verification_token()
    db.add(
        AccountActionToken(
            user_id=user.id,
            purpose=AccountActionPurpose.EMAIL_VERIFICATION,
            token_hash=hash_verification_token(raw),
            status=AccountActionStatus.PENDING,
            expires_at=now
            + timedelta(days=_VERIFICATION_TOKEN_TTL_DAYS),
        )
    )
    db.commit()
    return raw


def _latest_pending_verification(db: Session, user: User) -> AccountActionToken | None:
    return db.scalars(
        select(AccountActionToken)
        .where(
            AccountActionToken.user_id == user.id,
            AccountActionToken.purpose == AccountActionPurpose.EMAIL_VERIFICATION,
            AccountActionToken.status == AccountActionStatus.PENDING,
        )
        .order_by(AccountActionToken.created_at.desc())
    ).first()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db_session),
) -> UserResponse:
    """Create a user with the default BUYER role and an optional profile."""

    allowed, retry_after = _REGISTER_IP_LIMITER.allow(_client_ip(request))
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_RATE_LIMITED_DETAIL,
            headers={"Retry-After": str(retry_after)},
        )

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
    # V1 has no email infrastructure: the verification token is returned
    # in the registration response so local development and smoke suites
    # can complete activation. In production a mailer would deliver it.
    verification_token = _issue_verification_token(db, user)
    db.refresh(user)
    response = _user_response(db, user)
    response.verification_token = verification_token
    return response


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db_session),
) -> TokenResponse:
    """Verify credentials and issue access + refresh tokens (generic 401)."""

    ip_key = _client_ip(request)
    email = normalize_email(payload.email)
    account_key = f"account:{email}"

    blocked, retry_after = _LOGIN_ACCOUNT_LIMITER.blocked(account_key)
    ip_blocked, ip_retry_after = _LOGIN_IP_LIMITER.blocked(ip_key)
    if blocked or ip_blocked:
        # Same generic response for both buckets: never reveal which
        # limit tripped or whether the account exists.
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_RATE_LIMITED_DETAIL,
            headers={"Retry-After": str(max(retry_after, ip_retry_after))},
        )

    user = db.scalars(select(User).where(User.email == email)).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        _LOGIN_IP_LIMITER.record(ip_key)
        _LOGIN_ACCOUNT_LIMITER.record(account_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=_INVALID_CREDENTIALS
        )
    if user.status not in _LOGIN_ALLOWED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not allowed to authenticate.",
        )

    # Success: forgive this account's recent failures so a user who
    # typo'd twice then succeeded is not locked out on the next login.
    _LOGIN_ACCOUNT_LIMITER.reset(account_key)

    access_token, expires_in = create_access_token(user.id)
    _enforce_session_cap(db, user)
    refresh_token = _issue_refresh_token(db, user)
    db.commit()
    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
        refresh_token=refresh_token,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db_session)) -> TokenResponse:
    """Exchange a valid refresh token for new access + refresh tokens.

    The presented token is revoked and replaced (rotation). Presenting a
    token that was already rotated or otherwise revoked is replay (likely
    token theft), so the whole token family is revoked and the request is
    rejected.
    """

    # Lock the row so two concurrent refreshes with the same token cannot
    # both rotate it (one wins, the loser sees REVOKED and trips family
    # revocation — exactly the reuse-detection contract).
    record = _find_refresh_token(db, payload.refresh_token, for_update=True)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired.",
        )
    if record.status != RefreshTokenStatus.ACTIVE:
        # Replayed (rotated/revoked) token: revoke the family.
        if record.status == RefreshTokenStatus.REVOKED:
            _revoke_family(db, record.family_id)
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired.",
        )
    if record.expires_at <= datetime.now(timezone.utc):
        record.status = RefreshTokenStatus.EXPIRED
        db.commit()
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

    # Rotate: consume the presented token and issue its successor in the
    # same family. One transaction keeps the swap atomic.
    now = datetime.now(timezone.utc)
    record.status = RefreshTokenStatus.REVOKED
    record.rotated_at = now
    record.last_used_at = now
    record.revoked_at = now
    _enforce_session_cap(db, user)
    access_token, expires_in = create_access_token(user.id)
    new_refresh_token = _issue_refresh_token(db, user, family_id=record.family_id)
    db.commit()
    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
        refresh_token=new_refresh_token,
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


@router.post("/verify-email", response_model=UserResponse)
def verify_email(
    payload: VerifyEmailRequest,
    db: Session = Depends(get_db_session),
) -> UserResponse:
    """Redeem a single-use email-verification token and activate the account.

    Unauthenticated by design: the raw token IS the proof. Lookup is by
    token hash only, so a valid-but-foreign token cannot be matched to
    an email, and responses are generic to avoid account enumeration.
    """

    record = db.scalars(
        select(AccountActionToken).where(
            AccountActionToken.token_hash == hash_verification_token(payload.token),
            AccountActionToken.purpose == AccountActionPurpose.EMAIL_VERIFICATION,
        )
    ).first()
    if (
        record is None
        or record.status != AccountActionStatus.PENDING
        or record.expires_at <= datetime.now(timezone.utc)
    ):
        if record is not None and record.status == AccountActionStatus.PENDING:
            record.status = AccountActionStatus.EXPIRED
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token is invalid or expired.",
        )
    user = db.get(User, record.user_id)
    if user is None or user.status != UserStatus.PENDING_VERIFICATION:
        # Already verified / suspended / deleted: burn the token anyway.
        record.status = AccountActionStatus.USED
        record.used_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token is invalid or expired.",
        )
    now = datetime.now(timezone.utc)
    record.status = AccountActionStatus.USED
    record.used_at = now
    user.status = UserStatus.ACTIVE
    user.email_verified_at = now
    db.commit()
    db.refresh(user)
    return _user_response(db, user)


@router.post("/resend-verification")
def resend_verification(
    payload: ResendVerificationRequest,
    request: Request,
    db: Session = Depends(get_db_session),
) -> dict[str, str]:
    """Re-issue a verification token for a PENDING_VERIFICATION account.

    Rate-limited per IP like registration. The response is generic
    whether or not the account exists (no enumeration), and a cooldown on
    the previous PENDING token prevents spam. In V1 the fresh token is
    returned in the response because no email infrastructure exists.
    """

    allowed, retry_after = _REGISTER_IP_LIMITER.allow(_client_ip(request))
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_RATE_LIMITED_DETAIL,
            headers={"Retry-After": str(retry_after)},
        )
    email = normalize_email(payload.email)
    user = db.scalars(select(User).where(User.email == email)).first()
    if user is None or user.status != UserStatus.PENDING_VERIFICATION:
        return {"status": "sent"}
    latest = _latest_pending_verification(db, user)
    if latest is not None:
        age = (
            datetime.now(timezone.utc) - latest.created_at
        ).total_seconds()
        if age < _VERIFICATION_RESEND_COOLDOWN_SECONDS:
            return {"status": "sent"}
    raw = _issue_verification_token(db, user)
    return {"status": "sent", "verification_token": raw}
