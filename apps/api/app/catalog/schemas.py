"""Pydantic schemas for the Catalog API (listings, categories, images, favorites)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.limits import (
    ALLOWED_IMAGE_CONTENT_TYPES,
    MAX_IMAGE_BYTES,
    MAX_IMAGE_DIMENSION,
    MAX_MONEY_MINOR,
)


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    parent_id: uuid.UUID | None = None
    status: str
    created_at: datetime


class SellerSummary(BaseModel):
    id: uuid.UUID
    display_name: str | None = None


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    storage_key: str
    content_type: str
    byte_size: int
    width: int | None = None
    height: int | None = None
    alt_text: str | None = None
    sort_order: int
    is_primary: bool
    created_at: datetime


class AuctionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    current_bid_minor: int | None = None
    starts_at: datetime
    ends_at: datetime


class ListingOut(BaseModel):
    """Public listing representation (no internal ORM objects, no secrets)."""

    id: uuid.UUID
    title: str
    description: str | None = None
    sale_type: str
    status: str
    condition: str
    fixed_price_minor: int | None = None
    currency: str
    offers_enabled: bool
    city: str
    region: str | None = None
    country_code: str
    postal_code: str | None = None
    published_at: datetime | None = None
    expires_at: datetime | None = None
    sold_at: datetime | None = None
    category: CategoryOut
    seller: SellerSummary
    images: list[ImageOut] = []
    auction: AuctionSummary | None = None
    created_at: datetime
    updated_at: datetime


class PaginatedListings(BaseModel):
    items: list[ListingOut]
    total: int
    limit: int
    offset: int


class ListingCreate(BaseModel):
    """Creation input. seller_id/status are never accepted; status starts DRAFT."""

    model_config = ConfigDict(extra="ignore")

    category_id: uuid.UUID
    sale_type: str
    title: str = Field(min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=10000)
    condition: str
    fixed_price_minor: int | None = Field(default=None, gt=0, le=MAX_MONEY_MINOR)
    currency: str
    offers_enabled: bool = False
    city: str = Field(min_length=2, max_length=120)
    region: str | None = Field(default=None, max_length=120)
    country_code: str = Field(pattern=r"^[A-Z]{2}$")
    postal_code: str | None = Field(default=None, max_length=24)
    published_at: datetime | None = None
    expires_at: datetime | None = None


class ListingUpdate(BaseModel):
    """Updatable fields. sale_type and seller_id are intentionally absent (immutable)."""

    model_config = ConfigDict(extra="ignore")

    category_id: uuid.UUID | None = None
    title: str | None = Field(default=None, min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=10000)
    condition: str | None = None
    fixed_price_minor: int | None = Field(default=None, gt=0, le=MAX_MONEY_MINOR)
    currency: str | None = None
    offers_enabled: bool | None = None
    city: str | None = Field(default=None, min_length=2, max_length=120)
    region: str | None = Field(default=None, max_length=120)
    country_code: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    postal_code: str | None = Field(default=None, max_length=24)
    published_at: datetime | None = None
    expires_at: datetime | None = None
    sold_at: datetime | None = None
    status: str | None = None


class ImageCreate(BaseModel):
    """Image metadata registration. The V1 API never receives file bytes.

    Bounds mirror the storage policy the future object-store backend
    must enforce on real uploads: allowlisted MIME types, a 10 MiB size
    ceiling, and sane pixel dimensions. ``content_type`` is normalized
    to lowercase to keep the allowlist exact.
    """

    storage_key: str = Field(min_length=1, max_length=2000)
    content_type: str = Field(min_length=1, max_length=127)
    byte_size: int = Field(gt=0, le=MAX_IMAGE_BYTES)
    width: int | None = Field(default=None, gt=0, le=MAX_IMAGE_DIMENSION)
    height: int | None = Field(default=None, gt=0, le=MAX_IMAGE_DIMENSION)
    alt_text: str | None = Field(default=None, max_length=255)
    sort_order: int | None = Field(default=None, ge=0)
    is_primary: bool = False

    @field_validator("content_type")
    @classmethod
    def _check_content_type(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ALLOWED_IMAGE_CONTENT_TYPES:
            raise ValueError(
                "Unsupported image type. Allowed: "
                + ", ".join(sorted(ALLOWED_IMAGE_CONTENT_TYPES))
            )
        return normalized


class ImageUpdate(BaseModel):
    """Updatable image fields. sort_order/primary uniqueness enforced server-side."""

    model_config = ConfigDict(extra="ignore")

    sort_order: int | None = Field(default=None, ge=0)
    alt_text: str | None = Field(default=None, max_length=255)
    is_primary: bool | None = None


class FavoriteOut(BaseModel):
    user_id: uuid.UUID
    listing_id: uuid.UUID
    created_at: datetime
    listing: ListingOut
