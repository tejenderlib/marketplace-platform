"""Password hashing, JWT access tokens, and opaque refresh tokens.

Secrets policy: this module never logs passwords or tokens. Refresh
tokens are returned once to the caller; only their SHA-256 hex digest
is persisted (see ``auth_refresh_tokens.token_hash``).
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import get_settings


class TokenError(Exception):
    """Raised when an access token is missing, invalid, or expired."""


def validate_password_strength(password: str) -> None:
    """Enforce sensible password rules. Raises ValueError on violation."""

    if not 8 <= len(password) <= 72:
        raise ValueError("Password must be between 8 and 72 characters.")
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes (bcrypt limit).")
    if not any(char.isalpha() for char in password):
        raise ValueError("Password must contain at least one letter.")
    if not any(char.isdigit() for char in password):
        raise ValueError("Password must contain at least one digit.")


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt. Never store the input."""

    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Compare a plaintext candidate against a stored bcrypt hash."""

    try:
        return bcrypt.checkpw(
            password.encode("utf-8"), password_hash.encode("utf-8")
        )
    except (ValueError, TypeError):
        return False


def normalize_email(email: str) -> str:
    """Trim and lowercase an email address for storage and lookup."""

    return email.strip().lower()


def create_access_token(user_id: uuid.UUID) -> tuple[str, int]:
    """Issue a short-lived JWT access token. Returns (token, expires_in)."""

    settings = get_settings()
    expires_in = settings.jwt_access_token_expire_minutes * 60
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in)).timestamp()),
    }
    token = jwt.encode(
        payload,
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )
    return token, expires_in


def decode_access_token(token: str) -> uuid.UUID:
    """Validate a JWT access token and return the subject user id."""

    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError as error:
        raise TokenError("Access token has expired.") from error
    except jwt.InvalidTokenError as error:
        raise TokenError("Access token is invalid.") from error
    if payload.get("type") != "access":
        raise TokenError("Access token is invalid.")
    try:
        return uuid.UUID(str(payload.get("sub")))
    except (ValueError, TypeError, AttributeError) as error:
        raise TokenError("Access token is invalid.") from error


def generate_refresh_token() -> str:
    """Generate a high-entropy opaque refresh token (returned to caller)."""

    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    """Hash a refresh token for storage. The raw value is never persisted."""

    return hashlib.sha256(token.encode("utf-8")).hexdigest()
