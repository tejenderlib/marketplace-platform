"""auction settled_at marker

Revision ID: 20260910_0011
Revises: 20260910_0010
Create Date: 2026-09-10

Adds auctions.settled_at TIMESTAMPTZ NULL, populated atomically when a
winning auction settles after successful payment. Existing rows correctly
remain NULL (nothing has settled). No other changes.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260910_0011"
down_revision: str | Sequence[str] | None = "20260910_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "auctions", sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("auctions", "settled_at")
