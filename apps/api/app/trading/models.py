"""Phase 2C trading models: database foundation only.

Tables: offers, auctions, bids, auction_results.

Conventions (match project schema / Phases 2A-2B):
- SQLAlchemy 2.x mapped_column style on the shared DeclarativeBase.
- PostgreSQL authoritative: UUID PKs, TIMESTAMPTZ timestamps, native ENUMs.
- Application-generated UUIDs via ``default=uuid.uuid4``.
- UTC timestamps via ``server_default=func.now()`` (TIMESTAMPTZ).
- Money in BIGINT minor units (paise) + CHAR(3) INR-only currency (India-only marketplace).
- Explicit FK / unique / check / index names.
- Status-managed records; business rows are transitioned via status, never
  hard-deleted (all cross-entity links are RESTRICT).
- PostgreSQL is authoritative for auction state: current bid pointer,
  bid validity markers, and the final result row all live here.
- ``auctions.current_bid_id`` <-> ``bids.auction_id`` is circular: the
  current-bid FK uses ``use_alter=True`` so the migration creates it with
  a separate ALTER TABLE after both tables exist.
- Bid history is immutable: ``bids`` rows are insert-only (no ``updated_at``,
  no status transitions except forward markers set at insert by the future
  service layer under row locking). No UPDATE/DELETE path is provided here.
- V1 rule "offers only for FIXED_PRICE listings" and bid-amount validity
  are service-layer rules (they need cross-table reads under locking);
  the schema provides the columns and lifecycle states for them.
- No business logic or endpoints here.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CHAR,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.catalog.models import ListingSaleType, listing_sale_type_enum
from app.db.base import Base

# TIMESTAMPTZ on PostgreSQL via generic timezone-aware DateTime.
Timestamptz = DateTime(timezone=True)


class OfferStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    WITHDRAWN = "WITHDRAWN"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class AuctionStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    LIVE = "LIVE"
    ENDED = "ENDED"
    SETTLED = "SETTLED"
    CANCELLED = "CANCELLED"


class BidStatus(str, enum.Enum):
    OUTBID = "OUTBID"
    WINNING = "WINNING"
    WON = "WON"
    VOIDED = "VOIDED"


class AuctionResultStatus(str, enum.Enum):
    NO_BIDS = "NO_BIDS"
    AWAITING_CHECKOUT = "AWAITING_CHECKOUT"
    ORDER_CREATED = "ORDER_CREATED"
    PAYMENT_COMPLETED = "PAYMENT_COMPLETED"
    PAYMENT_EXPIRED = "PAYMENT_EXPIRED"


offer_status_enum = PG_ENUM(OfferStatus, name="offer_status", create_type=True)
auction_status_enum = PG_ENUM(
    AuctionStatus, name="auction_status", create_type=True
)
bid_status_enum = PG_ENUM(BidStatus, name="bid_status", create_type=True)
auction_result_status_enum = PG_ENUM(
    AuctionResultStatus, name="auction_result_status", create_type=True
)


class Offer(Base):
    """Buyer price proposal on a FIXED_PRICE listing (V1).

    The ``(listing_id, listing_sale_type)`` pair references
    ``listings(id, sale_type)`` so only FIXED_PRICE rows can be offered on;
    one PENDING offer per buyer/listing is enforced by a partial unique
    index. Amount/buyer/listing history is immutable: only ``status``,
    ``responded_at`` and ``expires_at``-driven expiry move a row.
    """

    __tablename__ = "offers"
    __table_args__ = (
        ForeignKeyConstraint(
            ["listing_id", "listing_sale_type"],
            ["listings.id", "listings.sale_type"],
            name="fk_offers_listing_id_sale_type",
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "amount_minor > 0",
            name="ck_offers_amount_positive",
        ),
        CheckConstraint(
            "currency = 'INR'",
            name="ck_offers_currency_inr",
        ),
        CheckConstraint(
            "listing_sale_type = 'FIXED_PRICE'",
            name="ck_offers_sale_type_fixed",
        ),
        Index("ix_offers_listing_id", "listing_id"),
        Index("ix_offers_buyer_id", "buyer_id"),
        Index("ix_offers_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    listing_sale_type: Mapped[ListingSaleType] = mapped_column(
        listing_sale_type_enum,
        nullable=False,
        default=ListingSaleType.FIXED_PRICE,
        server_default="FIXED_PRICE",
    )
    buyer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT", name="fk_offers_buyer_id"),
        nullable=False,
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[OfferStatus] = mapped_column(
        offer_status_enum,
        nullable=False,
        default=OfferStatus.PENDING,
        server_default="PENDING",
    )
    responded_at: Mapped[datetime | None] = mapped_column(
        Timestamptz, nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(Timestamptz, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamptz,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


Index(
    "uq_offers_pending_buyer_listing",
    Offer.listing_id,
    Offer.buyer_id,
    unique=True,
    postgresql_where=text("status = 'PENDING'"),
)
Index(
    "ix_offers_listing_status_created",
    Offer.listing_id,
    Offer.status,
    Offer.created_at.desc(),
)
Index(
    "ix_offers_buyer_status_created",
    Offer.buyer_id,
    Offer.status,
    Offer.created_at.desc(),
)


class Auction(Base):
    """Authoritative state machine for one AUCTION listing's sale event."""

    __tablename__ = "auctions"
    __table_args__ = (
        UniqueConstraint("listing_id", name="uq_auctions_listing_id"),
        CheckConstraint(
            "starting_bid_minor >= 0",
            name="ck_auctions_starting_bid_non_negative",
        ),
        CheckConstraint(
            "minimum_increment_minor > 0",
            name="ck_auctions_min_increment_positive",
        ),
        CheckConstraint(
            "reserve_minor IS NULL OR reserve_minor >= 0",
            name="ck_auctions_reserve_non_negative",
        ),
        CheckConstraint(
            "current_bid_minor IS NULL OR current_bid_minor >= 0",
            name="ck_auctions_current_bid_non_negative",
        ),
        CheckConstraint(
            "ends_at > starts_at",
            name="ck_auctions_ends_after_starts",
        ),
        Index("ix_auctions_status", "status"),
        Index("ix_auctions_ends_at", "ends_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "listings.id", ondelete="RESTRICT", name="fk_auctions_listing_id"
        ),
        nullable=False,
    )
    status: Mapped[AuctionStatus] = mapped_column(
        auction_status_enum,
        nullable=False,
        default=AuctionStatus.SCHEDULED,
        server_default="SCHEDULED",
    )
    starting_bid_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    minimum_increment_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reserve_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    current_bid_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    current_bid_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "bids.id",
            ondelete="RESTRICT",
            name="fk_auctions_current_bid_id",
            use_alter=True,
        ),
        nullable=True,
    )
    current_winning_bid_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "bids.id",
            ondelete="RESTRICT",
            name="fk_auctions_current_winning_bid_id",
            use_alter=True,
        ),
        nullable=True,
    )
    current_winner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="RESTRICT",
            name="fk_auctions_current_winner_id",
        ),
        nullable=True,
    )
    bid_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    starts_at: Mapped[datetime] = mapped_column(Timestamptz, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(Timestamptz, nullable=False)
    settled_at: Mapped[datetime | None] = mapped_column(Timestamptz, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamptz,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    bids: Mapped[list[Bid]] = relationship(
        back_populates="auction", foreign_keys="Bid.auction_id"
    )
    current_bid: Mapped[Bid | None] = relationship(foreign_keys=[current_bid_id])
    result: Mapped[AuctionResult | None] = relationship(back_populates="auction")


class Bid(Base):
    """Immutable single bid placement; append-only history."""

    __tablename__ = "bids"
    __table_args__ = (
        CheckConstraint(
            "amount_minor >= 0",
            name="ck_bids_amount_non_negative",
        ),
        CheckConstraint(
            "currency = 'INR'",
            name="ck_bids_currency_inr",
        ),
        Index("ix_bids_auction_id", "auction_id"),
        Index("ix_bids_bidder_id", "bidder_id"),
        Index("ix_bids_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    auction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("auctions.id", ondelete="RESTRICT", name="fk_bids_auction_id"),
        nullable=False,
    )
    bidder_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT", name="fk_bids_bidder_id"),
        nullable=False,
    )
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    status: Mapped[BidStatus] = mapped_column(
        bid_status_enum,
        nullable=False,
        default=BidStatus.WINNING,
        server_default="WINNING",
    )
    # No updated_at: rows are never modified after insert.
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )

    auction: Mapped[Auction] = relationship(
        back_populates="bids", foreign_keys=[auction_id]
    )


class AuctionResult(Base):
    """Final outcome of an auction; at most one row per auction."""

    __tablename__ = "auction_results"
    __table_args__ = (
        UniqueConstraint("auction_id", name="uq_auction_results_auction_id"),
        CheckConstraint(
            "final_price_minor IS NULL OR final_price_minor >= 0",
            name="ck_auction_results_price_non_negative",
        ),
        CheckConstraint(
            "currency IS NULL OR currency = 'INR'",
            name="ck_auction_results_currency_inr",
        ),
        CheckConstraint(
            "winning_bid_id IS NULL OR status <> 'NO_BIDS'",
            name="ck_auction_results_winner_consistent",
        ),
        Index("ix_auction_results_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    auction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "auctions.id",
            ondelete="RESTRICT",
            name="fk_auction_results_auction_id",
        ),
        nullable=False,
    )
    winning_bid_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "bids.id",
            ondelete="RESTRICT",
            name="fk_auction_results_winning_bid_id",
        ),
        nullable=True,
    )
    winner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="RESTRICT",
            name="fk_auction_results_winner_id",
        ),
        nullable=True,
    )
    status: Mapped[AuctionResultStatus] = mapped_column(
        auction_result_status_enum, nullable=False
    )
    final_price_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    currency: Mapped[str | None] = mapped_column(CHAR(3), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(Timestamptz, nullable=True)
    checkout_expires_at: Mapped[datetime | None] = mapped_column(
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

    auction: Mapped[Auction] = relationship(back_populates="result")
