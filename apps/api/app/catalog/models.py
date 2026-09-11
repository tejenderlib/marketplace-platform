"""Phase 2B marketplace models reconciled to the canonical schema.

Tables: categories, listings, listing_images, favorites.

Conventions (match project schema / Phase 1):
- SQLAlchemy 2.x mapped_column style on the shared DeclarativeBase.
- PostgreSQL authoritative: UUID PKs, TIMESTAMPTZ timestamps, native ENUMs.
- Application-generated UUIDs via ``default=uuid.uuid4``.
- UTC timestamps via ``server_default=func.now()`` (TIMESTAMPTZ).
- Money in BIGINT minor units (paise) + CHAR(3) INR-only currency
  (India-only marketplace).
- Explicit FK / unique / check / index names.
- Status-managed records; listings transition via status, never
  hard-deleted (seller/category links are RESTRICT to prevent hard
  deletes; images/favorites reference listings with CASCADE).
- ``sale_type`` (FIXED_PRICE / AUCTION) is immutable once dependent
  business records (offers, bids) exist; ``(id, sale_type)`` stays unique
  so trading tables can reference the pair.
- Listing images are storage abstractions (``storage_key`` resolved by
  the future local/S3/GCS backend), never raw URLs; at most one primary
  image per listing; image and snapshot rows are insert-oriented.
- No business logic or endpoints here.
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
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# TIMESTAMPTZ on PostgreSQL via generic timezone-aware DateTime.
Timestamptz = DateTime(timezone=True)


class CategoryStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class ListingSaleType(str, enum.Enum):
    FIXED_PRICE = "FIXED_PRICE"
    AUCTION = "AUCTION"


class ListingStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING_REVIEW = "PENDING_REVIEW"
    ACTIVE = "ACTIVE"
    RESERVED = "RESERVED"
    SOLD = "SOLD"
    EXPIRED = "EXPIRED"
    REJECTED = "REJECTED"
    REMOVED = "REMOVED"
    ARCHIVED = "ARCHIVED"


class ItemCondition(str, enum.Enum):
    NEW = "NEW"
    LIKE_NEW = "LIKE_NEW"
    GOOD = "GOOD"
    FAIR = "FAIR"
    POOR = "POOR"
    FOR_PARTS = "FOR_PARTS"


category_status_enum = PG_ENUM(
    CategoryStatus, name="category_status", create_type=True
)
listing_sale_type_enum = PG_ENUM(
    ListingSaleType, name="listing_sale_type", create_type=True
)
listing_status_enum = PG_ENUM(
    ListingStatus, name="listing_status", create_type=True
)
item_condition_enum = PG_ENUM(
    ItemCondition, name="item_condition", create_type=True
)


class Category(Base):
    """Listing taxonomy node; hierarchy via self-referencing parent."""

    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_categories_slug"),
        CheckConstraint(
            "char_length(name) >= 2",
            name="ck_categories_name",
        ),
        CheckConstraint(
            "char_length(slug) >= 2",
            name="ck_categories_slug",
        ),
        Index("ix_categories_status", "status"),
        Index("ix_categories_parent_id", "parent_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="RESTRICT", name="fk_categories_parent_id"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[CategoryStatus] = mapped_column(
        category_status_enum,
        nullable=False,
        default=CategoryStatus.ACTIVE,
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

    parent: Mapped[Category | None] = relationship(
        back_populates="children", remote_side="Category.id"
    )
    children: Mapped[list[Category]] = relationship(back_populates="parent")
    listings: Mapped[list[Listing]] = relationship(back_populates="category")


class Listing(Base):
    """Sellable item; FIXED_PRICE or AUCTION (sale_type immutable post-dependents)."""

    __tablename__ = "listings"
    __table_args__ = (
        UniqueConstraint("id", "sale_type", name="uq_listings_id_sale_type"),
        CheckConstraint(
            "char_length(title) >= 3",
            name="ck_listings_title",
        ),
        CheckConstraint(
            "description IS NULL OR char_length(description) <= 10000",
            name="ck_listings_description_length",
        ),
        CheckConstraint(
            "currency = 'INR'",
            name="ck_listings_currency_inr",
        ),
        CheckConstraint(
            "fixed_price_minor IS NULL OR fixed_price_minor > 0",
            name="ck_listings_fixed_price_positive",
        ),
        CheckConstraint(
            "sale_type = 'AUCTION' OR fixed_price_minor IS NOT NULL",
            name="ck_listings_fixed_price_required",
        ),
        CheckConstraint(
            "sale_type = 'FIXED_PRICE' OR fixed_price_minor IS NULL",
            name="ck_listings_auction_no_fixed_price",
        ),
        CheckConstraint(
            "offers_enabled = false OR sale_type = 'FIXED_PRICE'",
            name="ck_listings_offers_fixed_only",
        ),
        CheckConstraint(
            "country_code ~ '^[A-Z]{2}$'",
            name="ck_listings_country_code_format",
        ),
        Index("ix_listings_seller_id", "seller_id"),
        Index("ix_listings_category_id", "category_id"),
        Index("ix_listings_status", "status"),
        Index("ix_listings_sale_type", "sale_type"),
        Index("ix_listings_status_sale_type_published", "status", "sale_type", "published_at"),
        Index("ix_listings_category_status", "category_id", "status"),
        Index("ix_listings_seller_status", "seller_id", "status"),
        Index("ix_listings_city_region_status", "city", "region", "status"),
        Index(
            "ix_listings_active_fixed_price",
            "fixed_price_minor",
            postgresql_where=text("status = 'ACTIVE' AND sale_type = 'FIXED_PRICE'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    seller_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT", name="fk_listings_seller_id"),
        nullable=False,
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "categories.id", ondelete="RESTRICT", name="fk_listings_category_id"
        ),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sale_type: Mapped[ListingSaleType] = mapped_column(
        listing_sale_type_enum, nullable=False
    )
    status: Mapped[ListingStatus] = mapped_column(
        listing_status_enum,
        nullable=False,
        default=ListingStatus.DRAFT,
        server_default="DRAFT",
    )
    condition: Mapped[ItemCondition] = mapped_column(
        item_condition_enum,
        nullable=False,
        default=ItemCondition.GOOD,
        server_default="GOOD",
    )
    fixed_price_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    offers_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    region: Mapped[str | None] = mapped_column(String(120), nullable=True)
    country_code: Mapped[str] = mapped_column(CHAR(2), nullable=False)
    postal_code: Mapped[str | None] = mapped_column(String(24), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(Timestamptz, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(Timestamptz, nullable=True)
    sold_at: Mapped[datetime | None] = mapped_column(Timestamptz, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamptz,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    category: Mapped[Category] = relationship(back_populates="listings")
    images: Mapped[list[ListingImage]] = relationship(
        back_populates="listing", cascade="all, delete-orphan", passive_deletes=True
    )
    favorited_by: Mapped[list[Favorite]] = relationship(
        back_populates="listing", cascade="all, delete-orphan", passive_deletes=True
    )


# Full-text search over title + description (PostgreSQL GIN).
# NOTE: the expression is written exactly as PostgreSQL normalizes it
# (see pg_get_indexdef) so ``alembic check`` sees zero drift. A text()
# expression carries no table columns, so the index is attached to the
# listings table explicitly.
ix_listings_search = Index(
    "ix_listings_search",
    text(
        "to_tsvector('english'::regconfig, "
        "(title::text || ' '::text) || COALESCE(description, ''::text))"
    ),
    postgresql_using="gin",
)
Listing.__table__.indexes.add(ix_listings_search)


class ListingImage(Base):
    """Ordered storage-backed image row for a listing (max one primary)."""

    __tablename__ = "listing_images"
    __table_args__ = (
        UniqueConstraint(
            "listing_id", "sort_order", name="uq_listing_images_listing_sort_order"
        ),
        CheckConstraint(
            "byte_size > 0",
            name="ck_listing_images_byte_size_positive",
        ),
        CheckConstraint(
            "width IS NULL OR width > 0",
            name="ck_listing_images_width_positive",
        ),
        CheckConstraint(
            "height IS NULL OR height > 0",
            name="ck_listing_images_height_positive",
        ),
        Index("ix_listing_images_listing_id", "listing_id"),
        Index(
            "uq_listing_images_one_primary",
            "listing_id",
            unique=True,
            postgresql_where=text("is_primary"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "listings.id", ondelete="CASCADE", name="fk_listing_images_listing_id"
        ),
        nullable=False,
    )
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String(127), nullable=False)
    byte_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    alt_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )
    is_primary: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )

    listing: Mapped[Listing] = relationship(back_populates="images")


class Favorite(Base):
    """User bookmark; composite primary key, hard-deleted on unfavorite."""

    __tablename__ = "favorites"
    __table_args__ = (
        Index("ix_favorites_user_id", "user_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="fk_favorites_user_id"),
        primary_key=True,
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "listings.id", ondelete="CASCADE", name="fk_favorites_listing_id"
        ),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )

    listing: Mapped[Listing] = relationship(back_populates="favorited_by")


# Canonical composite lookup: listing_id with newest favorites first.
Index(
    "ix_favorites_listing_created",
    Favorite.listing_id,
    Favorite.created_at.desc(),
)
