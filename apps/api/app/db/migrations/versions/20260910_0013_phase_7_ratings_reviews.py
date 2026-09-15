"""phase 7.1 ratings & reviews

Revision ID: 20260910_0013
Revises: 20260910_0012
Create Date: 2026-09-14

Creates the reviews table exactly per the canonical definition:

- review_status enum (ACTIVE/REMOVED) + reviews table.
- One review per reviewer per order (UNIQUE order_id + reviewer_id).
- reviewer_id <> reviewee_id (self-reviews structurally impossible),
  rating BETWEEN 1 AND 5, comment <= 2000 chars.
- FKs RESTRICT to orders/users; ACTIVE default; immutable rows, soft
  moderation via status + removed_at only.
- Lookup indexes on (reviewee_id, status, created_at DESC),
  (reviewer_id, status, created_at DESC), and (order_id).

Also widens the existing moderation audit log to reviews by reusing the
canonical moderation_actions table (same pattern as Phase 4A.3):

- moderation_action_type gains REVIEW_REMOVED (PG12+ allows ADD VALUE in
  a transaction; the new value is never USED within this migration).
- moderation_actions.target_review_id UUID NULL FK reviews.id RESTRICT,
  and ck_moderation_actions_single_target is widened from a 2-way XOR to
  an exactly-one-of user/listing/review XOR so every row still targets
  exactly one entity.

NOTE: the moderation_action_type enum value REVIEW_REMOVED cannot be
dropped on downgrade (PostgreSQL does not support removing enum values);
the column/constraint/table changes are fully reversible, the enum value
is left in place after a downgrade.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260910_0013"
down_revision: str | Sequence[str] | None = "20260910_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    postgresql.ENUM(
        "ACTIVE", "REMOVED",
        name="review_status",
    ).create(op.get_bind(), checkfirst=True)
    op.create_table(
        "reviews",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column("reviewer_id", sa.UUID(), nullable=False),
        sa.Column("reviewee_id", sa.UUID(), nullable=False),
        sa.Column("rating", sa.SmallInteger(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "ACTIVE", "REMOVED",
                name="review_status", create_type=False,
            ),
            nullable=False,
            server_default="ACTIVE",
        ),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "reviewer_id <> reviewee_id",
            name="ck_reviews_no_self_review",
        ),
        sa.CheckConstraint(
            "rating BETWEEN 1 AND 5",
            name="ck_reviews_rating_range",
        ),
        sa.CheckConstraint(
            "comment IS NULL OR char_length(comment) <= 2000",
            name="ck_reviews_comment_length",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"],
            name="fk_reviews_order_id", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["reviewer_id"], ["users.id"],
            name="fk_reviews_reviewer_id", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["reviewee_id"], ["users.id"],
            name="fk_reviews_reviewee_id", ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "order_id", "reviewer_id", name="uq_reviews_order_reviewer"
        ),
    )
    op.create_index(
        "ix_reviews_reviewee_status_created", "reviews",
        ["reviewee_id", "status", sa.text("created_at DESC")], unique=False,
    )
    op.create_index(
        "ix_reviews_reviewer_status_created", "reviews",
        ["reviewer_id", "status", sa.text("created_at DESC")], unique=False,
    )
    op.create_index("ix_reviews_order_id", "reviews", ["order_id"], unique=False)

    # Reuse the canonical moderation audit log: new action type + review target.
    op.execute(
        "ALTER TYPE moderation_action_type ADD VALUE IF NOT EXISTS 'REVIEW_REMOVED'"
    )
    op.add_column(
        "moderation_actions",
        sa.Column("target_review_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_moderation_actions_review_id", "moderation_actions", "reviews",
        ["target_review_id"], ["id"], ondelete="RESTRICT",
    )
    op.drop_constraint(
        "ck_moderation_actions_single_target", "moderation_actions", type_="check"
    )
    op.create_check_constraint(
        "ck_moderation_actions_single_target",
        "moderation_actions",
        "(target_listing_id IS NOT NULL AND target_user_id IS NULL "
        "AND target_review_id IS NULL) OR "
        "(target_listing_id IS NULL AND target_user_id IS NOT NULL "
        "AND target_review_id IS NULL) OR "
        "(target_listing_id IS NULL AND target_user_id IS NULL "
        "AND target_review_id IS NOT NULL)",
    )
    op.create_index(
        "ix_moderation_actions_review_created", "moderation_actions",
        ["target_review_id", sa.text("created_at DESC")], unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_moderation_actions_review_created", table_name="moderation_actions"
    )
    op.drop_constraint(
        "ck_moderation_actions_single_target", "moderation_actions", type_="check"
    )
    op.create_check_constraint(
        "ck_moderation_actions_single_target",
        "moderation_actions",
        "(target_listing_id IS NOT NULL AND target_user_id IS NULL) OR "
        "(target_listing_id IS NULL AND target_user_id IS NOT NULL)",
    )
    op.drop_constraint(
        "fk_moderation_actions_review_id", "moderation_actions", type_="foreignkey"
    )
    op.drop_column("moderation_actions", "target_review_id")

    op.drop_index("ix_reviews_order_id", table_name="reviews")
    op.drop_index("ix_reviews_reviewer_status_created", table_name="reviews")
    op.drop_index("ix_reviews_reviewee_status_created", table_name="reviews")
    op.drop_table("reviews")
    op.execute("DROP TYPE IF EXISTS review_status")
    # moderation_action_type REVIEW_REMOVED intentionally left in place:
    # PostgreSQL does not support dropping enum values.