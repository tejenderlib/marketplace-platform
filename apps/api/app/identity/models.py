"""Phase 2A identity models: database foundation only.

Tables: roles, users, user_roles, user_profiles,
auth_refresh_tokens, account_action_tokens.

Conventions (match project schema / Phase 1):
- SQLAlchemy 2.x mapped_column style on the shared DeclarativeBase.
- PostgreSQL authoritative: UUID PKs, Timestamptz timestamps, native ENUMs.
- Application-generated UUIDs via ``default=uuid.uuid4``.
- UTC timestamps via ``server_default=func.now()`` (Timestamptz).
- Explicit FK / unique / check / index names.
- Users can hold buyer, seller, and admin roles independently
  via the user_roles join table.
- No authentication endpoints or business logic here.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.dialects.postgresql import UUID

# Timestamptz on PostgreSQL via generic timezone-aware DateTime.
Timestamptz = DateTime(timezone=True)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RoleName(str, enum.Enum):
    BUYER = "BUYER"
    SELLER = "SELLER"
    ADMIN = "ADMIN"


class UserStatus(str, enum.Enum):
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DELETED = "DELETED"


class RefreshTokenStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"
    EXPIRED = "EXPIRED"


class AccountActionPurpose(str, enum.Enum):
    EMAIL_VERIFICATION = "EMAIL_VERIFICATION"
    PASSWORD_RESET = "PASSWORD_RESET"


class AccountActionStatus(str, enum.Enum):
    PENDING = "PENDING"
    USED = "USED"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"


role_name_enum = PG_ENUM(RoleName, name="role_name", create_type=True)
user_status_enum = PG_ENUM(UserStatus, name="user_status", create_type=True)
refresh_token_status_enum = PG_ENUM(
    RefreshTokenStatus, name="refresh_token_status", create_type=True
)
account_action_purpose_enum = PG_ENUM(
    AccountActionPurpose, name="account_action_purpose", create_type=True
)
account_action_status_enum = PG_ENUM(
    AccountActionStatus, name="account_action_status", create_type=True
)


class Role(Base):
    """Static role catalogue: BUYER / SELLER / ADMIN."""

    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("name", name="uq_roles_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[RoleName] = mapped_column(
        role_name_enum, nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamptz,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    assignments: Mapped[list[UserRole]] = relationship(
        back_populates="role", cascade="all, delete-orphan", passive_deletes=True
    )


class User(Base):
    """Identity root. Role membership lives in user_roles."""

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        CheckConstraint(
            "char_length(email) >= 3 AND position('@' IN email) > 1",
            name="ck_users_email_format",
        ),
        Index("ix_users_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[UserStatus] = mapped_column(
        user_status_enum,
        nullable=False,
        default=UserStatus.PENDING_VERIFICATION,
        server_default="PENDING_VERIFICATION",
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(
        Timestamptz, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamptz,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    role_assignments: Mapped[list[UserRole]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    profile: Mapped[UserProfile | None] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    refresh_tokens: Mapped[list[AuthRefreshToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    action_tokens: Mapped[list[AccountActionToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class UserRole(Base):
    """Join table: a user may hold buyer, seller, admin independently."""

    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
        Index("ix_user_roles_user_id", "user_id"),
        Index("ix_user_roles_role_id", "role_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="fk_user_roles_user_id"),
        nullable=False,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="RESTRICT", name="fk_user_roles_role_id"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )

    user: Mapped[User] = relationship(back_populates="role_assignments")
    role: Mapped[Role] = relationship(back_populates="assignments")


class UserProfile(Base):
    """Optional 1-1 profile extension for a user."""

    __tablename__ = "user_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_profiles_user_id"),
        CheckConstraint(
            "display_name IS NULL OR char_length(display_name) >= 2",
            name="ck_user_profiles_display_name",
        ),
        CheckConstraint(
            "bio IS NULL OR char_length(bio) <= 2000",
            name="ck_user_profiles_bio_length",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="fk_user_profiles_user_id"),
        nullable=False,
    )
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamptz,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[User] = relationship(back_populates="profile")


class AuthRefreshToken(Base):
    """Hashed refresh-token record; raw token never persisted."""

    __tablename__ = "auth_refresh_tokens"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_auth_refresh_tokens_token_hash"),
        CheckConstraint(
            "char_length(token_hash) >= 32",
            name="ck_auth_refresh_tokens_token_hash",
        ),
        Index("ix_auth_refresh_tokens_user_id", "user_id"),
        Index("ix_auth_refresh_tokens_status", "status"),
        Index("ix_auth_refresh_tokens_expires_at", "expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id", ondelete="CASCADE", name="fk_auth_refresh_tokens_user_id"
        ),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[RefreshTokenStatus] = mapped_column(
        refresh_token_status_enum,
        nullable=False,
        default=RefreshTokenStatus.ACTIVE,
        server_default="ACTIVE",
    )
    expires_at: Mapped[datetime] = mapped_column(Timestamptz, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(
        Timestamptz, nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        Timestamptz, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamptz,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[User] = relationship(back_populates="refresh_tokens")


class AccountActionToken(Base):
    """Single-use account action (email verification / password reset)."""

    __tablename__ = "account_action_tokens"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_account_action_tokens_token_hash"),
        CheckConstraint(
            "char_length(token_hash) >= 32",
            name="ck_account_action_tokens_token_hash",
        ),
        CheckConstraint(
            "used_at IS NULL OR status = 'USED'",
            name="ck_account_action_tokens_used_consistent",
        ),
        Index("ix_account_action_tokens_user_id", "user_id"),
        Index("ix_account_action_tokens_status", "status"),
        Index("ix_account_action_tokens_expires_at", "expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id", ondelete="CASCADE", name="fk_account_action_tokens_user_id"
        ),
        nullable=False,
    )
    purpose: Mapped[AccountActionPurpose] = mapped_column(
        account_action_purpose_enum, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[AccountActionStatus] = mapped_column(
        account_action_status_enum,
        nullable=False,
        default=AccountActionStatus.PENDING,
        server_default="PENDING",
    )
    expires_at: Mapped[datetime] = mapped_column(Timestamptz, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(Timestamptz, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamptz,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[User] = relationship(back_populates="action_tokens")
