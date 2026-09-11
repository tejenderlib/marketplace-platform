"""canonical offers reconciliation

Revision ID: 20260910_0008
Revises: 20260910_0007
Create Date: 2026-09-10

Brings offers to the canonical schema without touching other tables:

- listing_sale_type (NOT NULL, DEFAULT FIXED_PRICE) + composite FK
  (listing_id, listing_sale_type) -> listings(id, sale_type) RESTRICT,
  replacing the single-column listing FK.
- message TEXT NULL, responded_at TIMESTAMPTZ NULL.
- amount_minor > 0 (was >= 0); listing_sale_type = FIXED_PRICE check.
- partial unique (listing_id, buyer_id) WHERE PENDING.
- composite (listing_id, status, created_at DESC) and
  (buyer_id, status, created_at DESC) indexes.
- INR-only CHECK retained untouched.

Existing rows (verified: none in practice) are backfilled from their
listing's sale_type and keep their amounts.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260910_0008"
down_revision: str | Sequence[str] | None = "20260910_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "offers",
        sa.Column(
            "listing_sale_type",
            postgresql.ENUM("FIXED_PRICE", "AUCTION", name="listing_sale_type", create_type=False),
            nullable=True,
        ),
    )
    op.add_column("offers", sa.Column("message", sa.Text(), nullable=True))
    op.add_column(
        "offers", sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True)
    )
    # backfill from the referenced listing; fall back to FIXED_PRICE
    op.execute(
        "UPDATE offers SET listing_sale_type = COALESCE("
        "(SELECT sale_type FROM listings WHERE listings.id = offers.listing_id), "
        "'FIXED_PRICE')"
    )
    op.alter_column(
        "offers", "listing_sale_type", nullable=False, server_default="FIXED_PRICE"
    )
    op.drop_constraint("fk_offers_listing_id", "offers", type_="foreignkey")
    op.create_foreign_key(
        "fk_offers_listing_id_sale_type",
        "offers", "listings",
        ["listing_id", "listing_sale_type"], ["id", "sale_type"],
        ondelete="RESTRICT",
    )
    op.drop_constraint("ck_offers_amount_non_negative", "offers", type_="check")
    op.create_check_constraint(
        "ck_offers_amount_positive", "offers", "amount_minor > 0"
    )
    op.create_check_constraint(
        "ck_offers_sale_type_fixed", "offers", "listing_sale_type = 'FIXED_PRICE'"
    )
    op.create_index(
        "uq_offers_pending_buyer_listing", "offers",
        ["listing_id", "buyer_id"], unique=True,
        postgresql_where=sa.text("status = 'PENDING'"),
    )
    op.create_index(
        "ix_offers_listing_status_created", "offers",
        ["listing_id", "status", sa.text("created_at DESC")], unique=False,
    )
    op.create_index(
        "ix_offers_buyer_status_created", "offers",
        ["buyer_id", "status", sa.text("created_at DESC")], unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_offers_buyer_status_created", table_name="offers")
    op.drop_index("ix_offers_listing_status_created", table_name="offers")
    op.drop_index("uq_offers_pending_buyer_listing", table_name="offers")
    op.drop_constraint("ck_offers_sale_type_fixed", "offers", type_="check")
    op.drop_constraint("ck_offers_amount_positive", "offers", type_="check")
    op.create_check_constraint(
        "ck_offers_amount_non_negative", "offers", "amount_minor >= 0"
    )
    op.drop_constraint("fk_offers_listing_id_sale_type", "offers", type_="foreignkey")
    op.create_foreign_key(
        "fk_offers_listing_id", "offers", "listings",
        ["listing_id"], ["id"], ondelete="RESTRICT",
    )
    op.alter_column("offers", "listing_sale_type", server_default=None)
    op.drop_column("offers", "listing_sale_type")
    op.drop_column("offers", "message")
    op.drop_column("offers", "responded_at")
