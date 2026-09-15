"""Phase 7.1 ratings & reviews models: database foundation only.

Table: reviews.

Conventions (match project schema / Phases 2A-2D):
- SQLAlchemy 2.x mapped_column style on the shared DeclarativeBase.
- PostgreSQL authoritative: UUID PKs, TIMESTAMPTZ timestamps, native ENUMs.
- Application-generated UUIDs via ``default=uuid.uuid4``.
- UTC timestamps via ``server_default=func.now()`` (TIMESTAMPTZ).
- Explicit FK / unique / check / index names.
- Status-managed records: admin removal is a soft moderation transition
  (ACTIVE -> REMOVED), never a hard delete, so historical records are
  preserved. Public reads filter to ACTIVE; the author's own history keeps
  REMOVED rows.
- One review per reviewer per order (UNIQUE order_id + reviewer_id).
- A review is written by a participant of the order only; reviewer_id is
  enforced by the API against order.buyer_id / order.seller_id, and the
  buyer <> seller constraint on orders plus ck_reviews_no_self_review make
  self-reviews structurally impossible.
- No updated_at: review content is immutable after creation; only the
  moderation status/removed_at transition is ever written.
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
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# TIMESTAMPTZ on PostgreSQL via generic timezone-aware DateTime.
Timestamptz = DateTime(timezone=True)


class ReviewStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    REMOVED = "REMOVED"


review_status_enum = PG_ENUM(
    ReviewStatus, name="review_status", create_type=True
)


class Review(Base):
    """Immutable per-order review, soft-moderated only."""

    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("order_id", "reviewer_id", name="uq_reviews_order_reviewer"),
        CheckConstraint(
            "reviewer_id <> reviewee_id",
            name="ck_reviews_no_self_review",
        ),
        CheckConstraint(
            "rating BETWEEN 1 AND 5",
            name="ck_reviews_rating_range",
        ),
        CheckConstraint(
            "comment IS NULL OR char_length(comment) <= 2000",
            name="ck_reviews_comment_length",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="RESTRICT", name="fk_reviews_order_id"),
        nullable=False,
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT", name="fk_reviews_reviewer_id"),
        nullable=False,
    )
    reviewee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT", name="fk_reviews_reviewee_id"),
        nullable=False,
    )
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ReviewStatus] = mapped_column(
        review_status_enum,
        nullable=False,
        default=ReviewStatus.ACTIVE,
        server_default="ACTIVE",
    )
    removed_at: Mapped[datetime | None] = mapped_column(Timestamptz, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )


Index(
    "ix_reviews_reviewee_status_created",
    Review.reviewee_id,
    Review.status,
    Review.created_at.desc(),
)
Index(
    "ix_reviews_reviewer_status_created",
    Review.reviewer_id,
    Review.status,
    Review.created_at.desc(),
)
Index(
    "ix_reviews_order_id",
    Review.order_id,
)