"""canonical auction/bidding columns

Revision ID: 20260910_0009
Revises: 20260910_0008
Create Date: 2026-09-10

Adds exactly the 7 missing canonical columns (no other changes):

- auctions.minimum_increment_minor BIGINT NOT NULL (no permanent DEFAULT;
  backfilled to 100000 paise = ₹1,000 for existing rows only)
- auctions.current_winning_bid_id UUID NULL -> bids.id RESTRICT
- auctions.current_winner_id UUID NULL -> users.id RESTRICT
- auctions.bid_count INTEGER NOT NULL DEFAULT 0
- bids.request_id UUID NOT NULL (backfilled with fresh UUIDs)
- auction_results.winner_id UUID NULL -> users.id RESTRICT
- auction_results.checkout_expires_at TIMESTAMPTZ NULL

Existing tables hold only test data (verified empty); backfills are
defensive. No enum, check, index, or relationship changes.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260910_0009"
down_revision: str | Sequence[str] | None = "20260910_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "auctions", sa.Column("minimum_increment_minor", sa.BigInteger(), nullable=True)
    )
    op.execute(
        "UPDATE auctions SET minimum_increment_minor = 100000 "
        "WHERE minimum_increment_minor IS NULL"
    )
    op.alter_column("auctions", "minimum_increment_minor", nullable=False)
    op.create_check_constraint(
        "ck_auctions_min_increment_positive", "auctions", "minimum_increment_minor > 0"
    )
    op.add_column("auctions", sa.Column("current_winning_bid_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_auctions_current_winning_bid_id", "auctions", "bids",
        ["current_winning_bid_id"], ["id"], ondelete="RESTRICT",
    )
    op.add_column("auctions", sa.Column("current_winner_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_auctions_current_winner_id", "auctions", "users",
        ["current_winner_id"], ["id"], ondelete="RESTRICT",
    )
    op.add_column(
        "auctions",
        sa.Column("bid_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("bids", sa.Column("request_id", sa.UUID(), nullable=True))
    op.execute("UPDATE bids SET request_id = gen_random_uuid() WHERE request_id IS NULL")
    op.alter_column("bids", "request_id", nullable=False)
    op.add_column("auction_results", sa.Column("winner_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_auction_results_winner_id", "auction_results", "users",
        ["winner_id"], ["id"], ondelete="RESTRICT",
    )
    op.add_column(
        "auction_results",
        sa.Column("checkout_expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("auction_results", "checkout_expires_at")
    op.drop_constraint("fk_auction_results_winner_id", "auction_results", type_="foreignkey")
    op.drop_column("auction_results", "winner_id")
    op.drop_column("bids", "request_id")
    op.execute("ALTER TABLE auctions ALTER COLUMN bid_count DROP DEFAULT")
    op.drop_column("auctions", "bid_count")
    op.drop_constraint("fk_auctions_current_winner_id", "auctions", type_="foreignkey")
    op.drop_column("auctions", "current_winner_id")
    op.drop_constraint("fk_auctions_current_winning_bid_id", "auctions", type_="foreignkey")
    op.drop_column("auctions", "current_winning_bid_id")
    op.drop_constraint("ck_auctions_min_increment_positive", "auctions", type_="check")
    op.drop_column("auctions", "minimum_increment_minor")
