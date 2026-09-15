"""phase 8.2 order checkout expiry + abandoned-reservation release

Revision ID: 20260910_0017
Revises: 20260910_0016
Create Date: 2026-09-15

Adds orders.checkout_expires_at: the payment deadline for a
PENDING_PAYMENT order. Past-due orders are lazily cancelled and their
listing reservation (RESERVED) is released back to ACTIVE.

The one-order-per-listing rule becomes partial: CANCELLED rows no longer
occupy the listing, so after a buyer cancel or checkout-window expiry a
fresh order can be placed on the same listing.

Existing rows get NULL (no deadline), preserving their current behaviour
exactly. New checkouts stamp the deadline at creation.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20260910_0017"
down_revision: str | Sequence[str] | None = "20260910_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "checkout_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_orders_checkout_expires_at",
        "orders",
        ["checkout_expires_at"],
    )
    # Unique listing occupancy now applies to live (non-CANCELLED) rows only.
    op.drop_constraint("uq_orders_listing_id", "orders", type_="unique")
    op.create_index(
        "uq_orders_listing_id",
        "orders",
        ["listing_id"],
        unique=True,
        postgresql_where=sa.text("status <> 'CANCELLED'"),
    )


def downgrade() -> None:
    op.drop_index("uq_orders_listing_id", table_name="orders")
    op.create_unique_constraint("uq_orders_listing_id", "orders", ["listing_id"])
    op.drop_index("ix_orders_checkout_expires_at", table_name="orders")
    op.drop_column("orders", "checkout_expires_at")
