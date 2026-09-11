"""Phase 2D orders models: database foundation only.

Tables: user_addresses, orders, order_shipping_addresses, shipments,
order_status_history, payments.

Conventions (match project schema / Phases 2A-2C):
- SQLAlchemy 2.x mapped_column style on the shared DeclarativeBase.
- PostgreSQL authoritative: UUID PKs, TIMESTAMPTZ timestamps, native ENUMs.
- Application-generated UUIDs via ``default=uuid.uuid4``.
- UTC timestamps via ``server_default=func.now()`` (TIMESTAMPTZ).
- Money in BIGINT minor units (paise) + CHAR(3) INR-only currency (India-only marketplace).
- Explicit FK / unique / check / index names.
- Status-managed records; business rows transition via status, never
  hard-deleted (cross-entity links are RESTRICT; subordinate snapshot and
  history rows use CASCADE like listing_images).
- No shopping cart: one order represents one listing (quantity covers
  multi-unit fixed-price purchases).
- Order sources FIXED_PRICE / ACCEPTED_OFFER / AUCTION_WIN are enforced
  with a consistency check on the source reference columns.
- Payment provider is an abstract ENUM starting with DUMMY only; the
  external payment id lives in ``provider_ref`` so a real provider can
  replace DUMMY later without changing order workflows. ``provider_ref``
  is unique for idempotency (NULLs allowed).
- Shipping/address snapshots are immutable: ``order_shipping_addresses``
  and ``order_status_history`` rows are insert-only (no ``updated_at``),
  copied at purchase so later address edits never rewrite history.
- No checkout, payment, fulfillment business logic or endpoints here.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CHAR,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# TIMESTAMPTZ on PostgreSQL via generic timezone-aware DateTime.
Timestamptz = DateTime(timezone=True)


class AddressStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class OrderSource(str, enum.Enum):
    FIXED_PRICE = "FIXED_PRICE"
    ACCEPTED_OFFER = "ACCEPTED_OFFER"
    AUCTION_WIN = "AUCTION_WIN"


class OrderStatus(str, enum.Enum):
    PENDING_PAYMENT = "PENDING_PAYMENT"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    PAID = "PAID"
    PROCESSING = "PROCESSING"
    READY_FOR_DELIVERY = "READY_FOR_DELIVERY"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class ShipmentStatus(str, enum.Enum):
    PENDING = "PENDING"
    SHIPPED = "SHIPPED"
    IN_TRANSIT = "IN_TRANSIT"
    DELIVERED = "DELIVERED"
    FAILED = "FAILED"


class PaymentProvider(str, enum.Enum):
    DUMMY = "DUMMY"


class PaymentStatus(str, enum.Enum):
    CREATED = "CREATED"
    PENDING = "PENDING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


address_status_enum = PG_ENUM(
    AddressStatus, name="address_status", create_type=True
)
order_source_enum = PG_ENUM(OrderSource, name="order_source", create_type=True)
order_status_enum = PG_ENUM(OrderStatus, name="order_status", create_type=True)
shipment_status_enum = PG_ENUM(
    ShipmentStatus, name="shipment_status", create_type=True
)
payment_provider_enum = PG_ENUM(
    PaymentProvider, name="payment_provider", create_type=True
)
payment_status_enum = PG_ENUM(
    PaymentStatus, name="payment_status", create_type=True
)


class UserAddress(Base):
    """Reusable buyer address book entry (status-managed, never rewritten)."""

    __tablename__ = "user_addresses"
    __table_args__ = (
        CheckConstraint(
            "char_length(recipient_name) >= 2",
            name="ck_user_addresses_recipient",
        ),
        CheckConstraint(
            "char_length(line1) >= 2",
            name="ck_user_addresses_line1",
        ),
        CheckConstraint(
            "char_length(city) >= 2",
            name="ck_user_addresses_city",
        ),
        CheckConstraint(
            "country ~ '^[A-Z]{2}$'",
            name="ck_user_addresses_country_iso3166",
        ),
        Index("ix_user_addresses_user_id", "user_id"),
        Index("ix_user_addresses_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT", name="fk_user_addresses_user_id"),
        nullable=False,
    )
    label: Mapped[str | None] = mapped_column(String(60), nullable=True)
    recipient_name: Mapped[str] = mapped_column(String(200), nullable=False)
    line1: Mapped[str] = mapped_column(String(300), nullable=False)
    line2: Mapped[str | None] = mapped_column(String(300), nullable=True)
    city: Mapped[str] = mapped_column(String(160), nullable=False)
    region: Mapped[str | None] = mapped_column(String(160), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    country: Mapped[str] = mapped_column(CHAR(2), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(60), nullable=True)
    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    status: Mapped[AddressStatus] = mapped_column(
        address_status_enum,
        nullable=False,
        default=AddressStatus.ACTIVE,
        server_default="ACTIVE",
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


class Order(Base):
    """One order represents one listing purchase, any source."""

    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("listing_id", name="uq_orders_listing_id"),
        UniqueConstraint("accepted_offer_id", name="uq_orders_accepted_offer_id"),
        UniqueConstraint("auction_result_id", name="uq_orders_auction_result_id"),
        CheckConstraint(
            "buyer_id <> seller_id",
            name="ck_orders_buyer_not_seller",
        ),
        CheckConstraint(
            "subtotal_minor >= 0",
            name="ck_orders_subtotal_non_negative",
        ),
        CheckConstraint(
            "shipping_minor >= 0",
            name="ck_orders_shipping_non_negative",
        ),
        CheckConstraint(
            "total_minor >= 0",
            name="ck_orders_total_non_negative",
        ),
        CheckConstraint(
            "total_minor = subtotal_minor + shipping_minor",
            name="ck_orders_total_matches_parts",
        ),
        CheckConstraint(
            "currency = 'INR'",
            name="ck_orders_currency_inr",
        ),
        CheckConstraint(
            "(source = 'FIXED_PRICE' AND accepted_offer_id IS NULL AND auction_result_id IS NULL) OR "
            "(source = 'ACCEPTED_OFFER' AND accepted_offer_id IS NOT NULL AND auction_result_id IS NULL) OR "
            "(source = 'AUCTION_WIN' AND auction_result_id IS NOT NULL AND accepted_offer_id IS NULL)",
            name="ck_orders_source_consistent",
        ),
        Index("ix_orders_buyer_id", "buyer_id"),
        Index("ix_orders_seller_id", "seller_id"),
        Index("ix_orders_listing_id", "listing_id"),
        Index("ix_orders_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "listings.id", ondelete="RESTRICT", name="fk_orders_listing_id"
        ),
        nullable=False,
    )
    buyer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT", name="fk_orders_buyer_id"),
        nullable=False,
    )
    seller_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT", name="fk_orders_seller_id"),
        nullable=False,
    )
    source: Mapped[OrderSource] = mapped_column(order_source_enum, nullable=False)
    accepted_offer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("offers.id", ondelete="RESTRICT", name="fk_orders_accepted_offer_id"),
        nullable=True,
    )
    auction_result_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "auction_results.id", ondelete="RESTRICT", name="fk_orders_auction_result_id"
        ),
        nullable=True,
    )
    listing_title_snapshot: Mapped[str] = mapped_column(String(180), nullable=False)
    contact_email_normalized: Mapped[str] = mapped_column(String(254), nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    subtotal_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    shipping_minor: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    total_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        order_status_enum,
        nullable=False,
        default=OrderStatus.PENDING_PAYMENT,
        server_default="PENDING_PAYMENT",
    )
    paid_at: Mapped[datetime | None] = mapped_column(Timestamptz, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(Timestamptz, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamptz,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    shipping_snapshot: Mapped[OrderShippingAddress | None] = relationship(
        back_populates="order", cascade="all, delete-orphan", passive_deletes=True
    )
    shipments: Mapped[list[Shipment]] = relationship(
        back_populates="order", cascade="all, delete-orphan", passive_deletes=True
    )
    status_history: Mapped[list[OrderStatusHistory]] = relationship(
        back_populates="order", cascade="all, delete-orphan", passive_deletes=True
    )
    payments: Mapped[list[Payment]] = relationship(back_populates="order")


class OrderShippingAddress(Base):
    """Immutable per-order address snapshot copied at purchase time."""

    __tablename__ = "order_shipping_addresses"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_order_shipping_addresses_order_id"),
        CheckConstraint(
            "country ~ '^[A-Z]{2}$'",
            name="ck_order_shipping_addresses_country_iso3166",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "orders.id",
            ondelete="CASCADE",
            name="fk_order_shipping_addresses_order_id",
        ),
        nullable=False,
    )
    source_address_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "user_addresses.id",
            ondelete="SET NULL",
            name="fk_order_shipping_addresses_source_address_id",
        ),
        nullable=True,
    )
    recipient_name: Mapped[str] = mapped_column(String(200), nullable=False)
    line1: Mapped[str] = mapped_column(String(300), nullable=False)
    line2: Mapped[str | None] = mapped_column(String(300), nullable=True)
    city: Mapped[str] = mapped_column(String(160), nullable=False)
    region: Mapped[str | None] = mapped_column(String(160), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    country: Mapped[str] = mapped_column(CHAR(2), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # No updated_at: snapshot rows are never modified after insert.
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )

    order: Mapped[Order] = relationship(back_populates="shipping_snapshot")


class Shipment(Base):
    """Fulfillment parcel for an order; status-managed lifecycle."""

    __tablename__ = "shipments"
    __table_args__ = (
        CheckConstraint(
            "delivered_at IS NULL OR shipped_at IS NOT NULL",
            name="ck_shipments_delivery_consistent",
        ),
        Index("ix_shipments_order_id", "order_id"),
        Index("ix_shipments_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "orders.id", ondelete="RESTRICT", name="fk_shipments_order_id"
        ),
        nullable=False,
    )
    carrier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tracking_number: Mapped[str | None] = mapped_column(String(160), nullable=True)
    status: Mapped[ShipmentStatus] = mapped_column(
        shipment_status_enum,
        nullable=False,
        default=ShipmentStatus.PENDING,
        server_default="PENDING",
    )
    shipped_at: Mapped[datetime | None] = mapped_column(Timestamptz, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(Timestamptz, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamptz,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    order: Mapped[Order] = relationship(back_populates="shipments")


class OrderStatusHistory(Base):
    """Immutable audit trail of order status transitions."""

    __tablename__ = "order_status_history"
    __table_args__ = (
        Index("ix_order_status_history_order_id", "order_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "orders.id",
            ondelete="CASCADE",
            name="fk_order_status_history_order_id",
        ),
        nullable=False,
    )
    from_status: Mapped[OrderStatus | None] = mapped_column(
        order_status_enum, nullable=True
    )
    to_status: Mapped[OrderStatus] = mapped_column(
        order_status_enum, nullable=False
    )
    changed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
            name="fk_order_status_history_changed_by_user_id",
        ),
        nullable=True,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # No updated_at: history rows are never modified after insert.
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )

    order: Mapped[Order] = relationship(back_populates="status_history")


class Payment(Base):
    """Payment attempt for an order via an abstract provider (DUMMY first)."""

    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint(
            "idempotency_key", name="uq_payments_idempotency_key"
        ),
        CheckConstraint(
            "amount_minor > 0",
            name="ck_payments_amount_positive",
        ),
        CheckConstraint(
            "currency = 'INR'",
            name="ck_payments_currency_inr",
        ),
        CheckConstraint(
            "provider_metadata IS NULL OR jsonb_typeof(provider_metadata) = 'object'",
            name="ck_payments_metadata_is_object",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "orders.id", ondelete="RESTRICT", name="fk_payments_order_id"
        ),
        nullable=False,
    )
    provider: Mapped[PaymentProvider] = mapped_column(
        payment_provider_enum,
        nullable=False,
        default=PaymentProvider.DUMMY,
        server_default="DUMMY",
    )
    provider_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        payment_status_enum,
        nullable=False,
        default=PaymentStatus.CREATED,
        server_default="CREATED",
    )
    simulated_outcome: Mapped[str | None] = mapped_column(String(20), nullable=True)
    failure_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    failure_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    provider_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    initiated_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )
    processed_at: Mapped[datetime | None] = mapped_column(Timestamptz, nullable=True)

    order: Mapped[Order] = relationship(back_populates="payments")


Index(
    "ix_payments_order_initiated",
    Payment.order_id,
    Payment.initiated_at.desc(),
)
Index(
    "ix_payments_status_initiated",
    Payment.status,
    Payment.initiated_at.desc(),
)


Index(
    "uq_payments_provider_reference",
    Payment.provider,
    Payment.provider_reference,
    unique=True,
    postgresql_where=text("provider_reference IS NOT NULL"),
)
Index(
    "uq_payments_order_succeeded",
    Payment.order_id,
    unique=True,
    postgresql_where=text("status = 'SUCCEEDED'"),
)
