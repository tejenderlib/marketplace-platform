"""canonical moderation audit log

Revision ID: 20260910_0012
Revises: 20260910_0011
Create Date: 2026-09-10

Creates moderation_action_type enum + moderation_actions table exactly per
the canonical definition: acting admin, action type, exactly one target
(user XOR listing, enforced by CHECK), required reason, JSONB metadata
default '{}', immutable timestamp. All FKs RESTRICT; DESC lookup indexes.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260910_0012"
down_revision: str | Sequence[str] | None = "20260910_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    postgresql.ENUM(
        "USER_SUSPENDED", "USER_REACTIVATED", "LISTING_REMOVED", "LISTING_RESTORED",
        "LISTING_REJECTED", "LISTING_APPROVED",
        name="moderation_action_type",
    ).create(op.get_bind(), checkfirst=True)
    op.create_table(
        "moderation_actions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("admin_id", sa.UUID(), nullable=False),
        sa.Column(
            "action_type",
            postgresql.ENUM(
                "USER_SUSPENDED", "USER_REACTIVATED", "LISTING_REMOVED", "LISTING_RESTORED",
                "LISTING_REJECTED", "LISTING_APPROVED",
                name="moderation_action_type", create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("target_listing_id", sa.UUID(), nullable=True),
        sa.Column("target_user_id", sa.UUID(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(target_listing_id IS NOT NULL AND target_user_id IS NULL) OR "
            "(target_listing_id IS NULL AND target_user_id IS NOT NULL)",
            name="ck_moderation_actions_single_target",
        ),
        sa.ForeignKeyConstraint(
            ["admin_id"], ["users.id"],
            name="fk_moderation_actions_admin_id", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["target_listing_id"], ["listings.id"],
            name="fk_moderation_actions_listing_id", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["target_user_id"], ["users.id"],
            name="fk_moderation_actions_user_id", ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_moderation_actions_listing_created", "moderation_actions",
        ["target_listing_id", sa.text("created_at DESC")], unique=False,
    )
    op.create_index(
        "ix_moderation_actions_user_created", "moderation_actions",
        ["target_user_id", sa.text("created_at DESC")], unique=False,
    )
    op.create_index(
        "ix_moderation_actions_admin_created", "moderation_actions",
        ["admin_id", sa.text("created_at DESC")], unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_moderation_actions_admin_created", table_name="moderation_actions")
    op.drop_index("ix_moderation_actions_user_created", table_name="moderation_actions")
    op.drop_index("ix_moderation_actions_listing_created", table_name="moderation_actions")
    op.drop_table("moderation_actions")
    op.execute("DROP TYPE IF EXISTS moderation_action_type")
