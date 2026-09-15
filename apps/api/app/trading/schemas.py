"""Pydantic schemas for the Offers API (buyer/seller flows, canonical lifecycle)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.limits import MAX_MONEY_MINOR


class ListingRef(BaseModel):
    id: uuid.UUID
    title: str
    sale_type: str
    status: str


class UserRef(BaseModel):
    id: uuid.UUID
    display_name: str | None = None


class OfferOut(BaseModel):
    """Safe offer representation (no internal ORM objects, no secrets)."""

    id: uuid.UUID
    listing_id: uuid.UUID
    buyer_id: uuid.UUID
    amount_minor: int
    currency: str
    message: str | None = None
    status: str
    responded_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    listing: ListingRef
    buyer: UserRef
    seller: UserRef


class PaginatedOffers(BaseModel):
    items: list[OfferOut]
    total: int
    limit: int
    offset: int


class OfferCreate(BaseModel):
    """Creation input. buyer_id is never accepted: the buyer is the auth user."""

    model_config = ConfigDict(extra="ignore")

    listing_id: uuid.UUID
    amount_minor: int = Field(gt=0, le=MAX_MONEY_MINOR)
    currency: str
    message: str | None = Field(default=None, max_length=2000)
    expires_at: datetime | None = None


class OfferRespond(BaseModel):
    """Seller decision. Only ACCEPTED/REJECTED/CANCELLED exist canonically."""

    status: str


class AuctionCreate(BaseModel):
    """Creation input. The seller is the listing owner (or ADMIN)."""

    model_config = ConfigDict(extra="ignore")

    listing_id: uuid.UUID
    starting_bid_minor: int = Field(gt=0, le=MAX_MONEY_MINOR)
    minimum_increment_minor: int = Field(gt=0, le=MAX_MONEY_MINOR)
    currency: str
    reserve_minor: int | None = Field(default=None, ge=0, le=MAX_MONEY_MINOR)
    starts_at: datetime
    ends_at: datetime


class AuctionWinnerRef(BaseModel):
    id: uuid.UUID
    display_name: str | None = None


class AuctionOut(BaseModel):
    """Authoritative auction state (PostgreSQL is the source of truth)."""

    id: uuid.UUID
    listing_id: uuid.UUID
    status: str
    starting_bid_minor: int
    minimum_increment_minor: int
    reserve_minor: int | None = None
    current_bid_minor: int | None = None
    current_winning_bid_id: uuid.UUID | None = None
    current_winner_id: uuid.UUID | None = None
    winner: AuctionWinnerRef | None = None
    bid_count: int
    starts_at: datetime
    ends_at: datetime
    settled_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    listing: ListingRef


class PaginatedAuctions(BaseModel):
    items: list[AuctionOut]
    total: int
    limit: int
    offset: int


class BidCreate(BaseModel):
    """Bid input. bidder comes from auth; request_id makes retries safe."""

    model_config = ConfigDict(extra="ignore")

    amount_minor: int = Field(gt=0, le=MAX_MONEY_MINOR)
    currency: str
    request_id: uuid.UUID


class BidOut(BaseModel):
    id: uuid.UUID
    auction_id: uuid.UUID
    bidder_id: uuid.UUID
    bidder: UserRef
    amount_minor: int
    currency: str
    status: str
    created_at: datetime


class PaginatedBids(BaseModel):
    items: list[BidOut]
    total: int
    bid_count: int
    limit: int
    offset: int


class AuctionResultOut(BaseModel):
    """Authoritative winner entitlement (read-only via API)."""

    id: uuid.UUID
    auction_id: uuid.UUID
    status: str
    winning_bid_id: uuid.UUID | None = None
    winner_id: uuid.UUID | None = None
    winner: AuctionWinnerRef | None = None
    final_price_minor: int | None = None
    currency: str | None = None
    decided_at: datetime | None = None
    checkout_expires_at: datetime | None = None
    created_at: datetime
