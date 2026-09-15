"""phase 8.1 auth hardening: refresh token families

Revision ID: 20260910_0016
Revises: 20260910_0015
Create Date: 2026-09-14

Adds family tracking to auth_refresh_tokens for refresh-token rotation
with reuse detection:

- family_id: groups tokens issued from one login chain. Existing rows
  get a fresh per-row family (they are single, un-rotated tokens, so a
  per-row family preserves their current behaviour exactly).
- rotated_at: set only when a token is consumed by a successful
  rotation. Presenting a token with rotated_at set is replay/theft and
  revokes the entire family.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20260910_0016"
down_revision: str | Sequence[str] | None = "20260910_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add as nullable first: the table already has rows in deployed
    # environments and PostgreSQL cannot backfill a NOT NULL column at
    # ADD COLUMN time without a default.
    op.add_column(
        "auth_refresh_tokens",
        sa.Column("family_id", sa.UUID(), nullable=True),
    )
    # Each pre-existing row becomes its own family: those tokens were
    # never rotated, so their behaviour (valid until logout/expiry) is
    # unchanged by the migration.
    op.execute(
        "UPDATE auth_refresh_tokens SET family_id = id WHERE family_id IS NULL"
    )
    op.alter_column("auth_refresh_tokens", "family_id", nullable=False)
    op.create_index(
        "ix_auth_refresh_tokens_family_id",
        "auth_refresh_tokens",
        ["family_id"],
    )
    op.add_column(
        "auth_refresh_tokens",
        sa.Column(
            "rotated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("auth_refresh_tokens", "rotated_at")
    op.drop_index("ix_auth_refresh_tokens_family_id", table_name="auth_refresh_tokens")
    op.drop_column("auth_refresh_tokens", "family_id")
