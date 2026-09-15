"""Notifications model: in-app notification bell foundation.

Table: notifications.

Conventions match project schema (reviews, admin models):
- SQLAlchemy 2.x mapped_column on shared DeclarativeBase.
- UUID PK, TIMESTAMPTZ, application-generated UUIDs, UTC server_default.
- user_id FK to users (the recipient); actor_id FK to users (who triggered).
- type enum for event classification; is_read boolean for unread tracking.
- No hard deletes: notification history is preserved.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

Timestamptz = DateTime(timezone=True)


class NotificationType(str, enum.Enum):
    OFFER_RECEIVED = "OFFER_RECEIVED"
    OFFER_ACCEPTED = "OFFER_ACCEPTED"
    ORDER_PLACED = "ORDER_PLACED"
    PAYMENT_SUCCEEDED = "PAYMENT_SUCCEEDED"
    REVIEW_RECEIVED = "REVIEW_RECEIVED"
    OUTBID = "OUTBID"
    AUCTION_WON = "AUCTION_WON"
    AUCTION_ENDED = "AUCTION_ENDED"
    LISTING_APPROVED = "LISTING_APPROVED"
    LISTING_REJECTED = "LISTING_REJECTED"
    LISTING_REMOVED = "LISTING_REMOVED"
    LISTING_RESTORED = "LISTING_RESTORED"
    ORDER_SHIPPED = "ORDER_SHIPPED"
    ORDER_DELIVERED = "ORDER_DELIVERED"


notification_type_enum = PG_ENUM(
    NotificationType, name="notification_type", create_type=True
)


class Notification(Base):
    """An in-app notification for a user."""

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="fk_notifications_user_id"),
        nullable=False,
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="fk_notifications_actor_id"),
        nullable=True,
    )
    type: Mapped[NotificationType] = mapped_column(
        notification_type_enum,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    link: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )


Index(
    "ix_notifications_user_read_created",
    Notification.user_id,
    Notification.is_read,
    Notification.created_at.desc(),
)
Index(
    "ix_notifications_user_id",
    Notification.user_id,
)
