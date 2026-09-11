"""phase 2b marketplace foundation

Revision ID: 20260910_0003
Revises: 20260910_0002
Create Date: 2026-09-10

Tables: categories, listings, listing_images, favorites.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260910_0003"
down_revision: str | Sequence[str] | None = "20260910_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("parent_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM("ACTIVE", "INACTIVE", name="category_status"),
            server_default="ACTIVE",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("char_length(name) >= 2", name="ck_categories_name"),
        sa.CheckConstraint("char_length(slug) >= 2", name="ck_categories_slug"),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["categories.id"],
            name="fk_categories_parent_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_categories_slug"),
    )
    op.create_index(
        "ix_categories_parent_id", "categories", ["parent_id"], unique=False
    )
    op.create_index("ix_categories_status", "categories", ["status"], unique=False)
    op.create_table(
        "listings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("seller_id", sa.UUID(), nullable=False),
        sa.Column("category_id", sa.UUID(), nullable=False),
        sa.Column(
            "sale_type",
            postgresql.ENUM("FIXED_PRICE", "AUCTION", name="listing_sale_type"),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(
                "DRAFT",
                "ACTIVE",
                "PAUSED",
                "SOLD",
                "CANCELLED",
                "EXPIRED",
                name="listing_status",
            ),
            server_default="DRAFT",
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column("quantity", sa.Integer(), server_default="1", nullable=False),
        sa.Column("starting_bid_minor", sa.BigInteger(), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name="ck_listings_currency_iso4217"
        ),
        sa.CheckConstraint(
            "sale_type = 'FIXED_PRICE' OR ends_at IS NOT NULL",
            name="ck_listings_auction_ends_at",
        ),
        sa.CheckConstraint("char_length(title) >= 3", name="ck_listings_title"),
        sa.CheckConstraint(
            "description IS NULL OR char_length(description) <= 10000",
            name="ck_listings_description_length",
        ),
        sa.CheckConstraint(
            "price_minor >= 0", name="ck_listings_price_non_negative"
        ),
        sa.CheckConstraint("quantity >= 1", name="ck_listings_quantity"),
        sa.CheckConstraint(
            "starting_bid_minor IS NULL OR starting_bid_minor >= 0",
            name="ck_listings_starting_bid_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name="fk_listings_category_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["seller_id"],
            ["users.id"],
            name="fk_listings_seller_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_listings_category_id", "listings", ["category_id"], unique=False
    )
    op.create_index("ix_listings_sale_type", "listings", ["sale_type"], unique=False)
    op.create_index("ix_listings_seller_id", "listings", ["seller_id"], unique=False)
    op.create_index("ix_listings_status", "listings", ["status"], unique=False)
    op.create_table(
        "favorites",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("listing_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM("ACTIVE", "REMOVED", name="favorite_status"),
            server_default="ACTIVE",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
            name="fk_favorites_listing_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_favorites_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "listing_id", name="uq_favorites_user_listing"
        ),
    )
    op.create_index(
        "ix_favorites_listing_id", "favorites", ["listing_id"], unique=False
    )
    op.create_index("ix_favorites_status", "favorites", ["status"], unique=False)
    op.create_index("ix_favorites_user_id", "favorites", ["user_id"], unique=False)
    op.create_table(
        "listing_images",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("listing_id", sa.UUID(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM("ACTIVE", "REMOVED", name="listing_image_status"),
            server_default="ACTIVE",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("position >= 0", name="ck_listing_images_position"),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
            name="fk_listing_images_listing_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "listing_id", "position", name="uq_listing_images_listing_position"
        ),
    )
    op.create_index(
        "ix_listing_images_listing_id",
        "listing_images",
        ["listing_id"],
        unique=False,
    )
    op.create_index(
        "ix_listing_images_status", "listing_images", ["status"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_listing_images_status", table_name="listing_images")
    op.drop_index("ix_listing_images_listing_id", table_name="listing_images")
    op.drop_table("listing_images")
    op.drop_index("ix_favorites_user_id", table_name="favorites")
    op.drop_index("ix_favorites_status", table_name="favorites")
    op.drop_index("ix_favorites_listing_id", table_name="favorites")
    op.drop_table("favorites")
    op.drop_index("ix_listings_status", table_name="listings")
    op.drop_index("ix_listings_seller_id", table_name="listings")
    op.drop_index("ix_listings_sale_type", table_name="listings")
    op.drop_index("ix_listings_category_id", table_name="listings")
    op.drop_table("listings")
    op.drop_index("ix_categories_status", table_name="categories")
    op.drop_index("ix_categories_parent_id", table_name="categories")
    op.drop_table("categories")
    for enum_name in (
        "category_status",
        "listing_sale_type",
        "listing_status",
        "listing_image_status",
        "favorite_status",
    ):
        op.execute(sa.text(f"DROP TYPE IF EXISTS {enum_name}"))
