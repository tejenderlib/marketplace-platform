"""phase 7.3d-7.6 messaging, reports, support + notification event types

Revision ID: 20260910_0015
Revises: 20260910_0014
Create Date: 2026-09-14

Extends notification_type with the 7.3d event events (outbid, auction,
listing moderation, order fulfillment) and adds the Phase 7.4/7.5/7.6
tables:

- conversations + messages (direct buyer-seller messaging)
- reports (user-submitted reports on listings / users)
- support_tickets + support_ticket_messages (help desk threads)
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260910_0015"
down_revision: str | Sequence[str] | None = "20260910_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_NOTIFICATION_TYPES = (
    "OUTBID",
    "AUCTION_WON",
    "AUCTION_ENDED",
    "LISTING_APPROVED",
    "LISTING_REJECTED",
    "LISTING_REMOVED",
    "LISTING_RESTORED",
    "ORDER_SHIPPED",
    "ORDER_DELIVERED",
)


def upgrade() -> None:
    for value in _NOTIFICATION_TYPES:
        op.execute(f"ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '{value}'")

    op.execute(
        "CREATE TYPE report_target_type AS ENUM ('LISTING', 'USER')"
    )
    op.execute(
        "CREATE TYPE report_status AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED')"
    )
    op.execute(
        "CREATE TYPE support_ticket_status AS ENUM "
        "('OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED')"
    )
    op.execute(
        "CREATE TYPE support_ticket_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT')"
    )

    # --- conversations -----------------------------------------------------
    op.create_table(
        "conversations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("buyer_id", sa.UUID(), nullable=False),
        sa.Column("seller_id", sa.UUID(), nullable=False),
        sa.Column("listing_id", sa.UUID(), nullable=False),
        sa.Column("offer_id", sa.UUID(), nullable=True),
        sa.Column("order_id", sa.UUID(), nullable=True),
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
            ["buyer_id"], ["users.id"],
            name="fk_conversations_buyer_id", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["seller_id"], ["users.id"],
            name="fk_conversations_seller_id", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"], ["listings.id"],
            name="fk_conversations_listing_id", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["offer_id"], ["offers.id"],
            name="fk_conversations_offer_id", ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"],
            name="fk_conversations_order_id", ondelete="SET NULL",
        ),
        sa.UniqueConstraint(
            "buyer_id", "seller_id", "listing_id",
            name="uq_conversations_buyer_seller_listing",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_conversations_buyer_id", "conversations", ["buyer_id"], unique=False
    )
    op.create_index(
        "ix_conversations_seller_id", "conversations", ["seller_id"], unique=False
    )

    # --- messages ----------------------------------------------------------
    op.create_table(
        "messages",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("sender_id", sa.UUID(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
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
            ["conversation_id"], ["conversations.id"],
            name="fk_messages_conversation_id", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["sender_id"], ["users.id"],
            name="fk_messages_sender_id", ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_messages_conversation_created", "messages",
        ["conversation_id", sa.text("created_at")], unique=False,
    )

    # --- reports -----------------------------------------------------------
    op.create_table(
        "reports",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("reporter_id", sa.UUID(), nullable=False),
        sa.Column(
            "target_type",
            postgresql.ENUM(
                "LISTING", "USER", name="report_target_type", create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("target_listing_id", sa.UUID(), nullable=True),
        sa.Column("target_user_id", sa.UUID(), nullable=True),
        sa.Column("reason", sa.String(length=120), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED",
                name="report_status", create_type=False,
            ),
            nullable=False,
            server_default="OPEN",
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
        sa.CheckConstraint(
            "(target_type = 'LISTING' AND target_listing_id IS NOT NULL AND target_user_id IS NULL) OR "
            "(target_type = 'USER' AND target_listing_id IS NULL AND target_user_id IS NOT NULL)",
            name="ck_reports_target_consistent",
        ),
        sa.ForeignKeyConstraint(
            ["reporter_id"], ["users.id"],
            name="fk_reports_reporter_id", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_listing_id"], ["listings.id"],
            name="fk_reports_listing_id", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_user_id"], ["users.id"],
            name="fk_reports_user_id", ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "reporter_id", "target_type", "target_listing_id",
            name="uq_reports_reporter_listing",
        ),
        sa.UniqueConstraint(
            "reporter_id", "target_type", "target_user_id",
            name="uq_reports_reporter_user",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reports_reporter_id", "reports", ["reporter_id"], unique=False)
    op.create_index("ix_reports_status", "reports", ["status"], unique=False)
    op.create_index(
        "ix_reports_target_listing", "reports", ["target_listing_id"], unique=False
    )
    op.create_index(
        "ix_reports_target_user", "reports", ["target_user_id"], unique=False
    )

    # --- support_tickets ---------------------------------------------------
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED",
                name="support_ticket_status", create_type=False,
            ),
            nullable=False,
            server_default="OPEN",
        ),
        sa.Column(
            "priority",
            postgresql.ENUM(
                "LOW", "NORMAL", "HIGH", "URGENT",
                name="support_ticket_priority", create_type=False,
            ),
            nullable=False,
            server_default="NORMAL",
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
            ["user_id"], ["users.id"],
            name="fk_support_tickets_user_id", ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_support_tickets_user_id", "support_tickets", ["user_id"], unique=False
    )
    op.create_index(
        "ix_support_tickets_status", "support_tickets", ["status"], unique=False
    )

    # --- support_ticket_messages ------------------------------------------
    op.create_table(
        "support_ticket_messages",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("ticket_id", sa.UUID(), nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["ticket_id"], ["support_tickets.id"],
            name="fk_stm_ticket_id", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"],
            name="fk_stm_author_id", ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_support_ticket_messages_ticket_created", "support_ticket_messages",
        ["ticket_id", sa.text("created_at")], unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_support_ticket_messages_ticket_created",
        table_name="support_ticket_messages",
    )
    op.drop_table("support_ticket_messages")
    op.drop_index("ix_support_tickets_status", table_name="support_tickets")
    op.drop_index("ix_support_tickets_user_id", table_name="support_tickets")
    op.drop_table("support_tickets")
    op.drop_index("ix_reports_target_user", table_name="reports")
    op.drop_index("ix_reports_target_listing", table_name="reports")
    op.drop_index("ix_reports_status", table_name="reports")
    op.drop_index("ix_reports_reporter_id", table_name="reports")
    op.drop_table("reports")
    op.drop_index("ix_messages_conversation_created", table_name="messages")
    op.drop_table("messages")
    op.drop_index("ix_conversations_seller_id", table_name="conversations")
    op.drop_index("ix_conversations_buyer_id", table_name="conversations")
    op.drop_table("conversations")
    op.execute("DROP TYPE IF EXISTS support_ticket_priority")
    op.execute("DROP TYPE IF EXISTS support_ticket_status")
    op.execute("DROP TYPE IF EXISTS report_status")
    op.execute("DROP TYPE IF EXISTS report_target_type")
    # NOTE: notification_type enum values are NOT dropped here. PostgreSQL
    # cannot drop enum values still referenced by rows, and 7.3a notifications
    # keep their history by design. The downgrade only removes the new tables.