"""inr-only currency policy

Revision ID: 20260910_0006
Revises: 20260910_0005
Create Date: 2026-09-10

Foundational currency-policy change: the marketplace is India-only and
INR is the single supported currency (ISO code INR, symbol ₹).

Money representation is unchanged (BIGINT minor units, i.e. paise;
CHAR(3) columns retained). Each generic ISO-4217 currency check is
replaced with an INR-only check of the same scope (nullable stays
nullable on auction_results). No structural changes.
"""

from collections.abc import Sequence

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20260910_0006"
down_revision: str | Sequence[str] | None = "20260910_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


CHANGES: tuple[tuple[str, str, str, str], ...] = (
    ("listings", "ck_listings_currency_iso4217", "ck_listings_currency_inr", "currency = 'INR'"),
    ("offers", "ck_offers_currency_iso4217", "ck_offers_currency_inr", "currency = 'INR'"),
    ("bids", "ck_bids_currency_iso4217", "ck_bids_currency_inr", "currency = 'INR'"),
    (
        "auction_results",
        "ck_auction_results_currency_iso4217",
        "ck_auction_results_currency_inr",
        "currency IS NULL OR currency = 'INR'",
    ),
    ("orders", "ck_orders_currency_iso4217", "ck_orders_currency_inr", "currency = 'INR'"),
    ("payments", "ck_payments_currency_iso4217", "ck_payments_currency_inr", "currency = 'INR'"),
)


def upgrade() -> None:
    for table, old_name, new_name, expression in CHANGES:
        op.drop_constraint(old_name, table, type_="check")
        op.create_check_constraint(new_name, table, expression)


def downgrade() -> None:
    for table, old_name, new_name, expression in reversed(CHANGES):
        op.drop_constraint(new_name, table, type_="check")
        if table == "auction_results":
            fallback = "currency IS NULL OR currency ~ '^[A-Z]{3}$'"
        else:
            fallback = "currency ~ '^[A-Z]{3}$'"
        op.create_check_constraint(old_name, table, fallback)
