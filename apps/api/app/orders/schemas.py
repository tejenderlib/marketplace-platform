"""Pydantic schemas for addresses, checkout, orders, and payments."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AddressBase(BaseModel):
    label: str | None = Field(default=None, max_length=60)
    recipient_name: str = Field(min_length=2, max_length=200)
    line1: str = Field(min_length=2, max_length=300)
    line2: str | None = Field(default=None, max_length=300)
    city: str = Field(min_length=2, max_length=160)
    region: str | None = Field(default=None, max_length=160)
    postal_code: str | None = Field(default=None, max_length=40)
    country: str = Field(pattern=r"^[A-Z]{2}$")
    phone: str | None = Field(default=None, max_length=60)


class AddressCreate(AddressBase):
    is_default: bool = False


class AddressUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    label: str | None = Field(default=None, max_length=60)
    recipient_name: str | None = Field(default=None, min_length=2, max_length=200)
    line1: str | None = Field(default=None, min_length=2, max_length=300)
    line2: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, min_length=2, max_length=160)
    region: str | None = Field(default=None, max_length=160)
    postal_code: str | None = Field(default=None, max_length=40)
    country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    phone: str | None = Field(default=None, max_length=60)
    is_default: bool | None = None


class AddressOut(AddressBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    is_default: bool
    status: str
    created_at: datetime
    updated_at: datetime


class CheckoutRequest(BaseModel):
    """Buy Now input. Prices/totals are never accepted: the server prices."""

    model_config = ConfigDict(extra="ignore")

    listing_id: uuid.UUID
    contact_email: str
    address_id: uuid.UUID | None = None
    address: AddressBase | None = None


class ShippingSnapshotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    recipient_name: str
    line1: str
    line2: str | None = None
    city: str
    region: str | None = None
    postal_code: str | None = None
    country: str
    phone: str | None = None


class HistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    from_status: str | None = None
    to_status: str
    changed_by_user_id: uuid.UUID | None = None
    note: str | None = None
    created_at: datetime


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    provider: str
    provider_reference: str | None = None
    amount_minor: int
    currency: str
    status: str
    simulated_outcome: str | None = None
    failure_code: str | None = None
    failure_message: str | None = None
    initiated_at: datetime
    processed_at: datetime | None = None


class OrderListingRef(BaseModel):
    id: uuid.UUID
    title: str
    sale_type: str
    status: str


class OrderPartyRef(BaseModel):
    id: uuid.UUID
    display_name: str | None = None


class OrderOut(BaseModel):
    """Safe order representation with snapshot, payments, and history."""

    id: uuid.UUID
    listing_id: uuid.UUID
    buyer_id: uuid.UUID
    seller_id: uuid.UUID
    source: str
    accepted_offer_id: uuid.UUID | None = None
    auction_result_id: uuid.UUID | None = None
    listing_title_snapshot: str
    contact_email_normalized: str
    currency: str
    subtotal_minor: int
    shipping_minor: int
    total_minor: int
    status: str
    paid_at: datetime | None = None
    cancelled_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    listing: OrderListingRef
    buyer: OrderPartyRef
    seller: OrderPartyRef
    shipping_snapshot: ShippingSnapshotOut | None = None
    payments: list[PaymentOut] = []
    history: list[HistoryOut] = []


class PaginatedOrders(BaseModel):
    items: list[OrderOut]
    total: int
    limit: int
    offset: int


class PaymentRequest(BaseModel):
    """Payment initiation. Amount comes from the order, never the client."""

    model_config = ConfigDict(extra="ignore")

    idempotency_key: uuid.UUID
    simulate: str = Field(default="success", pattern=r"^(success|failure)$")


class OrderPaymentResponse(BaseModel):
    payment: PaymentOut
    order: OrderOut


class OfferCheckoutRequest(BaseModel):
    """Accepted-offer checkout input. Price comes from the locked offer row."""

    model_config = ConfigDict(extra="ignore")

    offer_id: uuid.UUID
    contact_email: str
    address_id: uuid.UUID | None = None
    address: AddressBase | None = None


class AuctionCheckoutRequest(BaseModel):
    """Winner checkout input. Winner/price/seller all come from the result row."""

    model_config = ConfigDict(extra="ignore")

    auction_result_id: uuid.UUID
    contact_email: str
    address_id: uuid.UUID | None = None
    address: AddressBase | None = None
