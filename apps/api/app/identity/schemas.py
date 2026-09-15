"""Pydantic request/response schemas for the authentication API."""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator, Field

from app.identity.security import normalize_email, validate_password_strength

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_email(value: str) -> str:
    normalized = normalize_email(value)
    if not 3 <= len(normalized) <= 320 or _EMAIL_RE.match(normalized) is None:
        raise ValueError("Enter a valid email address.")
    return normalized


class RegisterRequest(BaseModel):
    """Registration input. No role field exists: ADMIN cannot be self-selected."""

    model_config = ConfigDict(extra="ignore")

    email: str
    password: str
    display_name: str | None = None

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return _validate_email(value)

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        validate_password_strength(value)
        return value

    @field_validator("display_name")
    @classmethod
    def _check_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if stripped == "":
            return None
        if not 2 <= len(stripped) <= 120:
            raise ValueError("Display name must be between 2 and 120 characters.")
        return stripped


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return _validate_email(value)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=16, max_length=512)


class ResendVerificationRequest(BaseModel):
    email: str

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return _validate_email(value)


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    display_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    avatar_url: str | None = None
    bio: str | None = None


class ProfileUpdate(BaseModel):
    """Owner-only edit of existing profile fields (no new columns)."""

    model_config = ConfigDict(extra="ignore")

    display_name: str | None = Field(default=None, max_length=120)
    avatar_key: str | None = Field(default=None, max_length=64)


class PublicUserProfile(BaseModel):
    """Public read-only profile. No email, roles, status, or auth data."""

    id: uuid.UUID
    display_name: str | None = None
    avatar_url: str | None = None
    location: str | None = None
    active_listings_count: int = 0


class UserResponse(BaseModel):
    """Safe user representation. Never includes password_hash or token secrets.

    ``verification_token`` is populated only by the register response in
    V1 (no email infrastructure): local development and smoke suites use
    it to activate the account. It is never included in /auth/me or any
    other read path.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    status: str
    email_verified_at: datetime | None = None
    roles: list[str] = []
    profile: ProfileResponse | None = None
    created_at: datetime
    verification_token: str | None = None
