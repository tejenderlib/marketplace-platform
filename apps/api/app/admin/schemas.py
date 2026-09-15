"""Pydantic schemas for the read-only admin API (safe summaries only)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DashboardStats(BaseModel):
    total_users: int
    active_users: int
    suspended_users: int
    total_listings: int
    active_listings: int
    sold_listings: int
    live_auctions: int
    ended_auctions: int
    total_orders: int
    paid_orders: int
    pending_payment_orders: int
    failed_payment_orders: int
    successful_payments: int
    successful_payments_total_minor: int
    successful_payments_currency: str = "INR"


class AdminUserSummary(BaseModel):
    """Safe user row: never password_hash, token hashes, or action secrets."""

    id: uuid.UUID
    email: str
    status: str
    roles: list[str] = []
    display_name: str | None = None
    created_at: datetime
    updated_at: datetime


class AdminUserDetail(AdminUserSummary):
    listings_count: int = 0
    buyer_orders_count: int = 0
    seller_orders_count: int = 0


class PaginatedAdminUsers(BaseModel):
    items: list[AdminUserSummary]
    total: int
    limit: int
    offset: int


class AdminAuctionDetail(BaseModel):
    """Auction admin view with result/settlement summary (no private data)."""

    model_config = ConfigDict(extra="ignore")

    id: uuid.UUID
    listing_id: uuid.UUID
    listing_title: str
    seller_id: uuid.UUID
    seller_display_name: str | None = None
    status: str
    starting_bid_minor: int
    minimum_increment_minor: int
    current_bid_minor: int | None = None
    current_winner_id: uuid.UUID | None = None
    bid_count: int
    starts_at: datetime
    ends_at: datetime
    settled_at: datetime | None = None
    result_status: str | None = None
    result_winner_id: uuid.UUID | None = None
    result_final_price_minor: int | None = None
    result_decided_at: datetime | None = None
    created_at: datetime


class ModerationRequest(BaseModel):
    """Mutation input: reason required (canonical NOT NULL); nothing else accepted."""

    model_config = ConfigDict(extra="ignore")

    reason: str = Field(min_length=1, max_length=2000)
    metadata: dict | None = None


class ModerationActionOut(BaseModel):
    """Safe audit row: ids + type + reason only, no credentials anywhere."""

    # `metadata` is the canonical column; the ORM attribute is aliased
    # because `metadata` is reserved on Declarative.
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    admin_id: uuid.UUID
    action_type: str
    target_listing_id: uuid.UUID | None = None
    target_user_id: uuid.UUID | None = None
    target_review_id: uuid.UUID | None = None
    reason: str
    metadata: dict = Field(default={}, alias="action_metadata")
    created_at: datetime


class PaginatedModerationActions(BaseModel):
    items: list[ModerationActionOut]
    total: int
    limit: int
    offset: int
