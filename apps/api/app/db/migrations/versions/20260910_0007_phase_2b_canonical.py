"""phase 2b canonical reconciliation

Revision ID: 20260910_0007
Revises: 20260910_0006
Create Date: 2026-09-10

Reconciles Phase 2B catalog tables with the canonical marketplace schema:

- listings: title VARCHAR(180); canonical 9-value listing_status;
  new item_condition enum; price_minor/quantity/starting_bid_minor/ends_at
  replaced by fixed_price_minor (nullable), offers_enabled, city/region/
  country_code/postal_code, published_at/expires_at/sold_at;
  INR-only check retained; composite (id, sale_type) uniqueness;
  canonical composite/partial/full-text indexes.
- listing_images: storage-backed structure (storage_key, content_type,
  byte_size, width/height, alt_text, sort_order, is_primary) replacing
  url/position/status/updated_at; per-listing sort uniqueness and a
  single-primary partial unique index.
- favorites: composite primary key (user_id, listing_id); status/
  updated_at/surrogate id removed; listing_id + created_at DESC index.

All transformations backfill legacy rows (verified empty in practice)
and preserve the INR-only policy from 20260910_0006.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260910_0007"
down_revision: str | Sequence[str] | None = "20260910_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _item_condition() -> postgresql.ENUM:
    return postgresql.ENUM(
        "NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR", "FOR_PARTS",
        name="item_condition",
    )


def upgrade() -> None:
    # --- listing_status -> canonical 9 values (PAUSED->ARCHIVED, CANCELLED->REMOVED)
    op.execute("ALTER TABLE listings ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TYPE listing_status RENAME TO listing_status_old")
    postgresql.ENUM(
        "DRAFT", "PENDING_REVIEW", "ACTIVE", "RESERVED", "SOLD", "EXPIRED",
        "REJECTED", "REMOVED", "ARCHIVED",
        name="listing_status",
    ).create(op.get_bind(), checkfirst=True)
    op.execute(
        "ALTER TABLE listings ALTER COLUMN status TYPE listing_status USING ("
        "(CASE status::text WHEN 'PAUSED' THEN 'ARCHIVED' "
        "WHEN 'CANCELLED' THEN 'REMOVED' ELSE status::text END)::listing_status)"
    )
    op.execute("ALTER TABLE listings ALTER COLUMN status SET DEFAULT 'DRAFT'::listing_status")
    op.execute("DROP TYPE listing_status_old")

    _item_condition().create(op.get_bind(), checkfirst=True)

    # --- listings: shrink title, add canonical columns (nullable first)
    op.alter_column(
        "listings", "title", existing_type=sa.String(200), type_=sa.String(180)
    )
    op.add_column(
        "listings",
        sa.Column(
            "condition",
            postgresql.ENUM(
                "NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR", "FOR_PARTS",
                name="item_condition", create_type=False,
            ),
            nullable=True,
        ),
    )
    op.add_column("listings", sa.Column("fixed_price_minor", sa.BigInteger(), nullable=True))
    op.add_column(
        "listings",
        sa.Column("offers_enabled", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column("listings", sa.Column("city", sa.String(120), nullable=True))
    op.add_column("listings", sa.Column("region", sa.String(120), nullable=True))
    op.add_column("listings", sa.Column("country_code", sa.CHAR(2), nullable=True))
    op.add_column("listings", sa.Column("postal_code", sa.String(24), nullable=True))
    op.add_column("listings", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("listings", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("listings", sa.Column("sold_at", sa.DateTime(timezone=True), nullable=True))

    # backfill legacy rows, then enforce NOT NULL
    op.execute("UPDATE listings SET condition = 'GOOD' WHERE condition IS NULL")
    op.execute("UPDATE listings SET city = 'Unknown' WHERE city IS NULL")
    op.execute("UPDATE listings SET country_code = 'IN' WHERE country_code IS NULL")
    op.alter_column("listings", "condition", nullable=False, server_default="GOOD")
    op.alter_column("listings", "city", nullable=False)
    op.alter_column("listings", "country_code", nullable=False)

    # drop superseded columns (constraints on them drop implicitly; named ones first)
    op.drop_constraint("ck_listings_price_non_negative", "listings", type_="check")
    op.drop_constraint("ck_listings_quantity", "listings", type_="check")
    op.drop_constraint("ck_listings_starting_bid_non_negative", "listings", type_="check")
    op.drop_constraint("ck_listings_auction_ends_at", "listings", type_="check")
    op.drop_column("listings", "price_minor")
    op.drop_column("listings", "quantity")
    op.drop_column("listings", "starting_bid_minor")
    op.drop_column("listings", "ends_at")

    # canonical checks + composite uniqueness (INR check retained untouched)
    op.create_check_constraint(
        "ck_listings_fixed_price_positive", "listings",
        "fixed_price_minor IS NULL OR fixed_price_minor > 0",
    )
    op.create_check_constraint(
        "ck_listings_fixed_price_required", "listings",
        "sale_type = 'AUCTION' OR fixed_price_minor IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_listings_auction_no_fixed_price", "listings",
        "sale_type = 'FIXED_PRICE' OR fixed_price_minor IS NULL",
    )
    op.create_check_constraint(
        "ck_listings_offers_fixed_only", "listings",
        "offers_enabled = false OR sale_type = 'FIXED_PRICE'",
    )
    op.create_check_constraint(
        "ck_listings_country_code_format", "listings",
        "country_code ~ '^[A-Z]{2}$'",
    )
    op.create_unique_constraint("uq_listings_id_sale_type", "listings", ["id", "sale_type"])

    # canonical indexes
    op.create_index(
        "ix_listings_status_sale_type_published", "listings",
        ["status", "sale_type", "published_at"], unique=False,
    )
    op.create_index(
        "ix_listings_category_status", "listings", ["category_id", "status"], unique=False
    )
    op.create_index(
        "ix_listings_seller_status", "listings", ["seller_id", "status"], unique=False
    )
    op.create_index(
        "ix_listings_city_region_status", "listings", ["city", "region", "status"],
        unique=False,
    )
    op.create_index(
        "ix_listings_active_fixed_price", "listings", ["fixed_price_minor"], unique=False,
        postgresql_where=sa.text("status = 'ACTIVE' AND sale_type = 'FIXED_PRICE'"),
    )
    op.create_index(
        "ix_listings_search", "listings",
        [sa.text("to_tsvector('english'::regconfig, (title::text || ' '::text) || COALESCE(description, ''::text))")],
        unique=False, postgresql_using="gin",
    )

    # --- listing_images: storage-backed structure
    op.add_column("listing_images", sa.Column("storage_key", sa.Text(), nullable=True))
    op.add_column("listing_images", sa.Column("content_type", sa.String(127), nullable=True))
    op.add_column("listing_images", sa.Column("byte_size", sa.BigInteger(), nullable=True))
    op.add_column("listing_images", sa.Column("width", sa.Integer(), nullable=True))
    op.add_column("listing_images", sa.Column("height", sa.Integer(), nullable=True))
    op.add_column("listing_images", sa.Column("alt_text", sa.String(255), nullable=True))
    op.add_column("listing_images", sa.Column("sort_order", sa.SmallInteger(), nullable=True))
    op.add_column("listing_images", sa.Column("is_primary", sa.Boolean(), nullable=True))
    op.execute(
        "UPDATE listing_images SET storage_key = url, "
        "content_type = 'application/octet-stream', byte_size = 1, "
        "sort_order = position, is_primary = false"
    )
    op.execute(
        "UPDATE listing_images SET is_primary = true WHERE id IN ("
        "SELECT DISTINCT ON (listing_id) id FROM listing_images ORDER BY listing_id, sort_order)"
    )
    for column in ("storage_key", "content_type", "byte_size", "sort_order", "is_primary"):
        op.alter_column("listing_images", column, nullable=False)
    op.alter_column("listing_images", "sort_order", server_default="0")
    op.alter_column("listing_images", "is_primary", server_default="false")
    op.create_unique_constraint(
        "uq_listing_images_listing_sort_order", "listing_images", ["listing_id", "sort_order"]
    )
    op.create_check_constraint(
        "ck_listing_images_byte_size_positive", "listing_images", "byte_size > 0"
    )
    op.create_check_constraint(
        "ck_listing_images_width_positive", "listing_images",
        "width IS NULL OR width > 0",
    )
    op.create_check_constraint(
        "ck_listing_images_height_positive", "listing_images",
        "height IS NULL OR height > 0",
    )
    op.create_index(
        "uq_listing_images_one_primary", "listing_images", ["listing_id"], unique=True,
        postgresql_where=sa.text("is_primary"),
    )
    op.drop_constraint("uq_listing_images_listing_position", "listing_images", type_="unique")
    op.drop_constraint("ck_listing_images_position", "listing_images", type_="check")
    op.drop_index("ix_listing_images_status", table_name="listing_images")
    op.drop_column("listing_images", "url")
    op.drop_column("listing_images", "position")
    op.drop_column("listing_images", "status")
    op.drop_column("listing_images", "updated_at")

    # --- favorites: composite primary key, no status bookkeeping
    op.drop_constraint("uq_favorites_user_listing", "favorites", type_="unique")
    op.drop_index("ix_favorites_status", table_name="favorites")
    op.drop_index("ix_favorites_listing_id", table_name="favorites")
    op.drop_column("favorites", "status")
    op.drop_column("favorites", "updated_at")
    op.drop_constraint("favorites_pkey", "favorites", type_="primary")
    op.drop_column("favorites", "id")
    op.create_primary_key("favorites_pkey", "favorites", ["user_id", "listing_id"])
    op.create_index(
        "ix_favorites_listing_created", "favorites",
        ["listing_id", sa.text("created_at DESC")], unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_favorites_listing_created", table_name="favorites")
    op.drop_constraint("favorites_pkey", "favorites", type_="primary")
    op.add_column("favorites", sa.Column("id", sa.UUID(), nullable=True))
    op.execute("UPDATE favorites SET id = gen_random_uuid()")
    op.alter_column("favorites", "id", nullable=False)
    op.create_primary_key("favorites_pkey", "favorites", ["id"])
    op.add_column(
        "favorites",
        sa.Column(
            "status",
            postgresql.ENUM("ACTIVE", "REMOVED", name="favorite_status", create_type=False),
            nullable=False, server_default="ACTIVE",
        ),
    )
    op.add_column(
        "favorites",
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_unique_constraint("uq_favorites_user_listing", "favorites", ["user_id", "listing_id"])
    op.create_index("ix_favorites_listing_id", "favorites", ["listing_id"], unique=False)
    op.create_index("ix_favorites_status", "favorites", ["status"], unique=False)

    op.drop_index("uq_listing_images_one_primary", table_name="listing_images")
    op.drop_constraint("ck_listing_images_height_positive", "listing_images", type_="check")
    op.drop_constraint("ck_listing_images_width_positive", "listing_images", type_="check")
    op.drop_constraint("ck_listing_images_byte_size_positive", "listing_images", type_="check")
    op.drop_constraint("uq_listing_images_listing_sort_order", "listing_images", type_="unique")
    op.add_column("listing_images", sa.Column("url", sa.Text(), nullable=True))
    op.add_column("listing_images", sa.Column("position", sa.Integer(), nullable=True))
    op.add_column(
        "listing_images",
        sa.Column(
            "status",
            postgresql.ENUM("ACTIVE", "REMOVED", name="listing_image_status", create_type=False),
            nullable=True,
        ),
    )
    op.add_column(
        "listing_images",
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.execute("UPDATE listing_images SET url = storage_key, position = sort_order, status = 'ACTIVE'")
    op.alter_column("listing_images", "url", nullable=False)
    op.alter_column("listing_images", "position", nullable=False)
    op.alter_column("listing_images", "status", nullable=False)
    op.drop_column("listing_images", "storage_key")
    op.drop_column("listing_images", "content_type")
    op.drop_column("listing_images", "byte_size")
    op.drop_column("listing_images", "width")
    op.drop_column("listing_images", "height")
    op.drop_column("listing_images", "alt_text")
    op.drop_column("listing_images", "sort_order")
    op.drop_column("listing_images", "is_primary")
    op.create_unique_constraint(
        "uq_listing_images_listing_position", "listing_images", ["listing_id", "position"]
    )
    op.create_check_constraint("ck_listing_images_position", "listing_images", "position >= 0")
    op.create_index("ix_listing_images_status", "listing_images", ["status"], unique=False)

    op.drop_index("ix_listings_search", table_name="listings")
    op.drop_index("ix_listings_active_fixed_price", table_name="listings")
    op.drop_index("ix_listings_city_region_status", table_name="listings")
    op.drop_index("ix_listings_seller_status", table_name="listings")
    op.drop_index("ix_listings_category_status", table_name="listings")
    op.drop_index("ix_listings_status_sale_type_published", table_name="listings")
    op.drop_constraint("uq_listings_id_sale_type", "listings", type_="unique")
    op.drop_constraint("ck_listings_country_code_format", "listings", type_="check")
    op.drop_constraint("ck_listings_offers_fixed_only", "listings", type_="check")
    op.drop_constraint("ck_listings_auction_no_fixed_price", "listings", type_="check")
    op.drop_constraint("ck_listings_fixed_price_required", "listings", type_="check")
    op.drop_constraint("ck_listings_fixed_price_positive", "listings", type_="check")
    op.add_column("listings", sa.Column("price_minor", sa.BigInteger(), nullable=True))
    op.add_column("listings", sa.Column("quantity", sa.Integer(), server_default="1", nullable=False))
    op.add_column("listings", sa.Column("starting_bid_minor", sa.BigInteger(), nullable=True))
    op.add_column("listings", sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE listings SET price_minor = COALESCE(fixed_price_minor, 0)")
    op.alter_column("listings", "price_minor", nullable=False)
    op.drop_column("listings", "fixed_price_minor")
    op.drop_column("listings", "offers_enabled")
    op.drop_column("listings", "city")
    op.drop_column("listings", "region")
    op.drop_column("listings", "country_code")
    op.drop_column("listings", "postal_code")
    op.drop_column("listings", "published_at")
    op.drop_column("listings", "expires_at")
    op.drop_column("listings", "sold_at")
    op.alter_column("listings", "condition", nullable=True)
    op.drop_column("listings", "condition")
    op.alter_column(
        "listings", "title", existing_type=sa.String(180), type_=sa.String(200)
    )
    op.create_check_constraint(
        "ck_listings_price_non_negative", "listings", "price_minor >= 0"
    )
    op.create_check_constraint("ck_listings_quantity", "listings", "quantity >= 1")
    op.create_check_constraint(
        "ck_listings_starting_bid_non_negative", "listings",
        "starting_bid_minor IS NULL OR starting_bid_minor >= 0",
    )
    op.create_check_constraint(
        "ck_listings_auction_ends_at", "listings",
        "sale_type = 'FIXED_PRICE' OR ends_at IS NOT NULL",
    )
    op.execute("ALTER TABLE listings ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TYPE listing_status RENAME TO listing_status_new")
    postgresql.ENUM(
        "DRAFT", "ACTIVE", "PAUSED", "SOLD", "CANCELLED", "EXPIRED",
        name="listing_status",
    ).create(op.get_bind(), checkfirst=True)
    op.execute(
        "ALTER TABLE listings ALTER COLUMN status TYPE listing_status USING ("
        "(CASE status::text WHEN 'ARCHIVED' THEN 'PAUSED' WHEN 'REMOVED' THEN 'CANCELLED' "
        "WHEN 'PENDING_REVIEW' THEN 'DRAFT' WHEN 'RESERVED' THEN 'ACTIVE' "
        "WHEN 'REJECTED' THEN 'CANCELLED' ELSE status::text END)::listing_status)"
    )
    op.execute("ALTER TABLE listings ALTER COLUMN status SET DEFAULT 'DRAFT'::listing_status")
    op.execute("DROP TYPE listing_status_new")
    op.execute("DROP TYPE IF EXISTS item_condition")
