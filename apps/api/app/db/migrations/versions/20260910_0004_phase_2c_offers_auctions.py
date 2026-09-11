"""phase 2c offers and auctions foundation

Revision ID: 20260910_0004
Revises: 20260910_0003
Create Date: 2026-09-10

Tables: offers, auctions, bids, auction_results.

Circular relationship handled explicitly: auctions.current_bid_id
references bids.id, while bids.auction_id references auctions.id.
The auctions table is created first WITHOUT the current-bid FK;
the FK is added with ALTER TABLE after bids exists (matching
use_alter=True on the model). Downgrade drops that FK first.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260910_0004"
down_revision: str | Sequence[str] | None = "20260910_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # auctions first, WITHOUT fk_auctions_current_bid_id (bids not yet created).
    op.create_table(
        "auctions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("listing_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "DRAFT",
                "SCHEDULED",
                "LIVE",
                "ENDED",
                "SETTLED",
                "CANCELLED",
                name="auction_status",
            ),
            server_default="SCHEDULED",
            nullable=False,
        ),
        sa.Column("starting_bid_minor", sa.BigInteger(), nullable=False),
        sa.Column("reserve_minor", sa.BigInteger(), nullable=True),
        sa.Column("current_bid_minor", sa.BigInteger(), nullable=True),
        sa.Column("current_bid_id", sa.UUID(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
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
            "current_bid_minor IS NULL OR current_bid_minor >= 0",
            name="ck_auctions_current_bid_non_negative",
        ),
        sa.CheckConstraint(
            "ends_at > starts_at", name="ck_auctions_ends_after_starts"
        ),
        sa.CheckConstraint(
            "reserve_minor IS NULL OR reserve_minor >= 0",
            name="ck_auctions_reserve_non_negative",
        ),
        sa.CheckConstraint(
            "starting_bid_minor >= 0",
            name="ck_auctions_starting_bid_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
            name="fk_auctions_listing_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("listing_id", name="uq_auctions_listing_id"),
    )
    op.create_index("ix_auctions_ends_at", "auctions", ["ends_at"], unique=False)
    op.create_index("ix_auctions_status", "auctions", ["status"], unique=False)
    op.create_table(
        "offers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("listing_id", sa.UUID(), nullable=False),
        sa.Column("buyer_id", sa.UUID(), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "PENDING",
                "ACCEPTED",
                "REJECTED",
                "WITHDRAWN",
                "EXPIRED",
                "CANCELLED",
                name="offer_status",
            ),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
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
            "currency ~ '^[A-Z]{3}$'", name="ck_offers_currency_iso4217"
        ),
        sa.CheckConstraint(
            "amount_minor >= 0", name="ck_offers_amount_non_negative"
        ),
        sa.ForeignKeyConstraint(
            ["buyer_id"],
            ["users.id"],
            name="fk_offers_buyer_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
            name="fk_offers_listing_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_offers_buyer_id", "offers", ["buyer_id"], unique=False)
    op.create_index(
        "ix_offers_listing_id", "offers", ["listing_id"], unique=False
    )
    op.create_index("ix_offers_status", "offers", ["status"], unique=False)
    op.create_table(
        "bids",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("auction_id", sa.UUID(), nullable=False),
        sa.Column("bidder_id", sa.UUID(), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "OUTBID", "WINNING", "WON", "VOIDED", name="bid_status"
            ),
            server_default="WINNING",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name="ck_bids_currency_iso4217"
        ),
        sa.CheckConstraint(
            "amount_minor >= 0", name="ck_bids_amount_non_negative"
        ),
        sa.ForeignKeyConstraint(
            ["auction_id"],
            ["auctions.id"],
            name="fk_bids_auction_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["bidder_id"],
            ["users.id"],
            name="fk_bids_bidder_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bids_auction_id", "bids", ["auction_id"], unique=False)
    op.create_index("ix_bids_bidder_id", "bids", ["bidder_id"], unique=False)
    op.create_index("ix_bids_status", "bids", ["status"], unique=False)
    # Circular FK added explicitly now that bids exists.
    op.create_foreign_key(
        "fk_auctions_current_bid_id",
        "auctions",
        "bids",
        ["current_bid_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_table(
        "auction_results",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("auction_id", sa.UUID(), nullable=False),
        sa.Column("winning_bid_id", sa.UUID(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "NO_BIDS",
                "AWAITING_CHECKOUT",
                "ORDER_CREATED",
                "PAYMENT_COMPLETED",
                "PAYMENT_EXPIRED",
                name="auction_result_status",
            ),
            nullable=False,
        ),
        sa.Column("final_price_minor", sa.BigInteger(), nullable=True),
        sa.Column("currency", sa.CHAR(length=3), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
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
            "currency IS NULL OR currency ~ '^[A-Z]{3}$'",
            name="ck_auction_results_currency_iso4217",
        ),
        sa.CheckConstraint(
            "winning_bid_id IS NULL OR status <> 'NO_BIDS'",
            name="ck_auction_results_winner_consistent",
        ),
        sa.CheckConstraint(
            "final_price_minor IS NULL OR final_price_minor >= 0",
            name="ck_auction_results_price_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["auction_id"],
            ["auctions.id"],
            name="fk_auction_results_auction_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["winning_bid_id"],
            ["bids.id"],
            name="fk_auction_results_winning_bid_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("auction_id", name="uq_auction_results_auction_id"),
    )
    op.create_index(
        "ix_auction_results_status",
        "auction_results",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_auction_results_status", table_name="auction_results")
    op.drop_table("auction_results")
    # Drop the circular FK before removing bids.
    op.drop_constraint(
        "fk_auctions_current_bid_id", "auctions", type_="foreignkey"
    )
    op.drop_index("ix_bids_status", table_name="bids")
    op.drop_index("ix_bids_bidder_id", table_name="bids")
    op.drop_index("ix_bids_auction_id", table_name="bids")
    op.drop_table("bids")
    op.drop_index("ix_offers_status", table_name="offers")
    op.drop_index("ix_offers_listing_id", table_name="offers")
    op.drop_index("ix_offers_buyer_id", table_name="offers")
    op.drop_table("offers")
    op.drop_index("ix_auctions_status", table_name="auctions")
    op.drop_index("ix_auctions_ends_at", table_name="auctions")
    op.drop_table("auctions")
    for enum_name in (
        "offer_status",
        "auction_status",
        "bid_status",
        "auction_result_status",
    ):
        op.execute(sa.text(f"DROP TYPE IF EXISTS {enum_name}"))
