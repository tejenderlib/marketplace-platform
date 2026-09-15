"""Phase 4A.3 moderation audit models (immutable action log)."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# TIMESTAMPTZ on PostgreSQL via generic timezone-aware DateTime.
Timestamptz = DateTime(timezone=True)


class ModerationActionType(str, enum.Enum):
    USER_SUSPENDED = "USER_SUSPENDED"
    USER_REACTIVATED = "USER_REACTIVATED"
    LISTING_REMOVED = "LISTING_REMOVED"
    LISTING_RESTORED = "LISTING_RESTORED"
    LISTING_REJECTED = "LISTING_REJECTED"
    LISTING_APPROVED = "LISTING_APPROVED"
    REVIEW_REMOVED = "REVIEW_REMOVED"


moderation_action_type_enum = PG_ENUM(
    ModerationActionType, name="moderation_action_type", create_type=True
)


class ModerationAction(Base):
    """Immutable audit row: exactly one per successful moderation mutation."""

    __tablename__ = "moderation_actions"
    __table_args__ = (
        CheckConstraint(
            "(target_listing_id IS NOT NULL AND target_user_id IS NULL AND target_review_id IS NULL) OR "
            "(target_listing_id IS NULL AND target_user_id IS NOT NULL AND target_review_id IS NULL) OR "
            "(target_listing_id IS NULL AND target_user_id IS NULL AND target_review_id IS NOT NULL)",
            name="ck_moderation_actions_single_target",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    admin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT", name="fk_moderation_actions_admin_id"),
        nullable=False,
    )
    action_type: Mapped[ModerationActionType] = mapped_column(
        moderation_action_type_enum, nullable=False
    )
    target_listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "listings.id", ondelete="RESTRICT", name="fk_moderation_actions_listing_id"
        ),
        nullable=True,
    )
    target_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id", ondelete="RESTRICT", name="fk_moderation_actions_user_id"
        ),
        nullable=True,
    )
    target_review_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "reviews.id", ondelete="RESTRICT", name="fk_moderation_actions_review_id"
        ),
        nullable=True,
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    # Attribute aliased: `metadata` is reserved by Declarative; the column
    # stays canonically named `metadata`.
    action_metadata: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict, server_default="{}"
    )
    # No updated_at: audit rows are never modified after insert.
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )


Index(
    "ix_moderation_actions_listing_created",
    ModerationAction.target_listing_id,
    ModerationAction.created_at.desc(),
)
Index(
    "ix_moderation_actions_user_created",
    ModerationAction.target_user_id,
    ModerationAction.created_at.desc(),
)
Index(
    "ix_moderation_actions_admin_created",
    ModerationAction.admin_id,
    ModerationAction.created_at.desc(),
)
Index(
    "ix_moderation_actions_review_created",
    ModerationAction.target_review_id,
    ModerationAction.created_at.desc(),
)
