"""phase 7.3a notifications foundation

Revision ID: 20260910_0014
Revises: 20260910_0013
Create Date: 2026-09-14

Creates the notifications table for in-app notification bell:

- notification_type enum (5 event types).
- notifications table with user_id FK (recipient), actor_id FK (who triggered),
  type, title, body, link, is_read, created_at.
- Index on (user_id, is_read, created_at DESC) for unread count + panel query.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260910_0014"
down_revision: str | Sequence[str] | None = "20260910_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    postgresql.ENUM(
        "OFFER_RECEIVED", "OFFER_ACCEPTED", "ORDER_PLACED",
        "PAYMENT_SUCCEEDED", "REVIEW_RECEIVED",
        name="notification_type",
    ).create(op.get_bind(), checkfirst=True)
    op.create_table(
        "notifications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column(
            "type",
            postgresql.ENUM(
                "OFFER_RECEIVED", "OFFER_ACCEPTED", "ORDER_PLACED",
                "PAYMENT_SUCCEEDED", "REVIEW_RECEIVED",
                name="notification_type", create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("link", sa.Text(), nullable=True),
        sa.Column(
            "is_read",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_notifications_user_id", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"],
            name="fk_notifications_actor_id", ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_notifications_user_read_created", "notifications",
        ["user_id", "is_read", sa.text("created_at DESC")], unique=False,
    )
    op.create_index(
        "ix_notifications_user_id", "notifications",
        ["user_id"], unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_index("ix_notifications_user_read_created", table_name="notifications")
    op.drop_table("notifications")
    op.execute("DROP TYPE IF EXISTS notification_type")
