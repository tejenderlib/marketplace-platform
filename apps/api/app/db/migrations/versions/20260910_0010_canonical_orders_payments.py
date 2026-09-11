"""canonical orders/payments reconciliation

Revision ID: 20260910_0010
Revises: 20260910_0009
Create Date: 2026-09-10

Reconciles Phase 2D tables with the canonical schema (tables verified
empty/test-only; legacy columns are replaced, not duplicated):

- orders: amount_minor/quantity/offer_id/auction_id replaced by
  subtotal/shipping/total_minor, listing_title_snapshot,
  contact_email_normalized, paid_at/cancelled_at, accepted_offer_id,
  auction_result_id; buyer!=seller + totals + source-consistency checks;
  unique listing/accepted_offer/auction_result.
- payments: provider_ref/authorized_at/captured_at/failure_reason/
  created_at/updated_at replaced by provider_reference, idempotency_key,
  simulated_outcome, failure_code/message, provider_metadata JSONB,
  initiated_at/processed_at; status default CREATED; amount > 0;
  unique idempotency_key, partial uniques for provider ref + one
  SUCCEEDED per order; canonical composite indexes.
- order_status_history: changed_by -> changed_by_user_id, reason -> note.
- INR-only checks retained. Enums untouched.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260910_0010"
down_revision: str | Sequence[str] | None = "20260910_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- orders: drop legacy checks/columns
    op.drop_constraint("ck_orders_amount_non_negative", "orders", type_="check")
    op.drop_constraint("ck_orders_quantity", "orders", type_="check")
    op.drop_constraint("ck_orders_source_consistent", "orders", type_="check")
    op.drop_constraint("fk_orders_offer_id", "orders", type_="foreignkey")
    op.drop_constraint("fk_orders_auction_id", "orders", type_="foreignkey")
    op.drop_column("orders", "amount_minor")
    op.drop_column("orders", "quantity")
    op.drop_column("orders", "offer_id")
    op.drop_column("orders", "auction_id")

    # --- orders: canonical columns
    op.add_column("orders", sa.Column("accepted_offer_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_orders_accepted_offer_id", "orders", "offers",
        ["accepted_offer_id"], ["id"], ondelete="RESTRICT",
    )
    op.add_column("orders", sa.Column("auction_result_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_orders_auction_result_id", "orders", "auction_results",
        ["auction_result_id"], ["id"], ondelete="RESTRICT",
    )
    op.add_column("orders", sa.Column("listing_title_snapshot", sa.String(180), nullable=True))
    op.add_column("orders", sa.Column("contact_email_normalized", sa.String(254), nullable=True))
    op.add_column("orders", sa.Column("subtotal_minor", sa.BigInteger(), nullable=True))
    op.add_column(
        "orders",
        sa.Column("shipping_minor", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.add_column("orders", sa.Column("total_minor", sa.BigInteger(), nullable=True))
    op.execute(
        "UPDATE orders SET listing_title_snapshot = COALESCE("
        "(SELECT title FROM listings WHERE listings.id = orders.listing_id), 'Unknown'), "
        "contact_email_normalized = COALESCE("
        "(SELECT email FROM users WHERE users.id = orders.buyer_id), 'unknown@example.com'), "
        "subtotal_minor = 0, total_minor = 0 "
        "WHERE listing_title_snapshot IS NULL"
    )
    op.alter_column("orders", "listing_title_snapshot", nullable=False)
    op.alter_column("orders", "contact_email_normalized", nullable=False)
    op.alter_column("orders", "subtotal_minor", nullable=False)
    op.alter_column("orders", "total_minor", nullable=False)
    op.add_column("orders", sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("orders", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))

    op.create_unique_constraint("uq_orders_listing_id", "orders", ["listing_id"])
    op.create_unique_constraint("uq_orders_accepted_offer_id", "orders", ["accepted_offer_id"])
    op.create_unique_constraint("uq_orders_auction_result_id", "orders", ["auction_result_id"])
    op.create_check_constraint("ck_orders_buyer_not_seller", "orders", "buyer_id <> seller_id")
    op.create_check_constraint("ck_orders_subtotal_non_negative", "orders", "subtotal_minor >= 0")
    op.create_check_constraint("ck_orders_shipping_non_negative", "orders", "shipping_minor >= 0")
    op.create_check_constraint("ck_orders_total_non_negative", "orders", "total_minor >= 0")
    op.create_check_constraint(
        "ck_orders_total_matches_parts", "orders", "total_minor = subtotal_minor + shipping_minor"
    )
    op.create_check_constraint(
        "ck_orders_source_consistent", "orders",
        "(source = 'FIXED_PRICE' AND accepted_offer_id IS NULL AND auction_result_id IS NULL) OR "
        "(source = 'ACCEPTED_OFFER' AND accepted_offer_id IS NOT NULL AND auction_result_id IS NULL) OR "
        "(source = 'AUCTION_WIN' AND auction_result_id IS NOT NULL AND accepted_offer_id IS NULL)",
    )

    # --- payments: drop legacy columns/constraints
    op.drop_constraint("uq_payments_provider_ref", "payments", type_="unique")
    op.drop_constraint("ck_payments_amount_non_negative", "payments", type_="check")
    op.drop_index("ix_payments_order_id", table_name="payments")
    op.drop_index("ix_payments_status", table_name="payments")
    op.drop_column("payments", "provider_ref")
    op.drop_column("payments", "authorized_at")
    op.drop_column("payments", "captured_at")
    op.drop_column("payments", "failure_reason")
    op.drop_column("payments", "created_at")
    op.drop_column("payments", "updated_at")

    # --- payments: canonical columns (status default PENDING -> CREATED)
    op.execute("ALTER TABLE payments ALTER COLUMN status DROP DEFAULT")
    op.add_column("payments", sa.Column("provider_reference", sa.String(255), nullable=True))
    op.add_column("payments", sa.Column("idempotency_key", sa.UUID(), nullable=True))
    op.execute("UPDATE payments SET idempotency_key = gen_random_uuid() WHERE idempotency_key IS NULL")
    op.alter_column("payments", "idempotency_key", nullable=False)
    op.add_column("payments", sa.Column("simulated_outcome", sa.String(20), nullable=True))
    op.add_column("payments", sa.Column("failure_code", sa.String(100), nullable=True))
    op.add_column("payments", sa.Column("failure_message", sa.String(500), nullable=True))
    op.add_column("payments", sa.Column("provider_metadata", postgresql.JSONB(), nullable=True))
    op.add_column(
        "payments",
        sa.Column("initiated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.add_column("payments", sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'CREATED'::payment_status")
    op.create_unique_constraint("uq_payments_idempotency_key", "payments", ["idempotency_key"])
    op.create_index(
        "uq_payments_provider_reference", "payments", ["provider", "provider_reference"],
        unique=True, postgresql_where=sa.text("provider_reference IS NOT NULL"),
    )
    op.create_index(
        "uq_payments_order_succeeded", "payments", ["order_id"],
        unique=True, postgresql_where=sa.text("status = 'SUCCEEDED'"),
    )
    op.create_index(
        "ix_payments_order_initiated", "payments", ["order_id", sa.text("initiated_at DESC")],
        unique=False,
    )
    op.create_index(
        "ix_payments_status_initiated", "payments", ["status", sa.text("initiated_at DESC")],
        unique=False,
    )
    op.create_check_constraint("ck_payments_amount_positive", "payments", "amount_minor > 0")
    op.create_check_constraint(
        "ck_payments_metadata_is_object", "payments",
        "provider_metadata IS NULL OR jsonb_typeof(provider_metadata) = 'object'",
    )

    # --- order_status_history: canonical names
    op.drop_constraint("fk_order_status_history_changed_by", "order_status_history", type_="foreignkey")
    op.alter_column("order_status_history", "changed_by", new_column_name="changed_by_user_id")
    op.alter_column("order_status_history", "reason", new_column_name="note")
    op.create_foreign_key(
        "fk_order_status_history_changed_by_user_id", "order_status_history", "users",
        ["changed_by_user_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_order_status_history_changed_by_user_id", "order_status_history", type_="foreignkey"
    )
    op.alter_column("order_status_history", "note", new_column_name="reason")
    op.alter_column("order_status_history", "changed_by_user_id", new_column_name="changed_by")
    op.create_foreign_key(
        "fk_order_status_history_changed_by", "order_status_history", "users",
        ["changed_by"], ["id"], ondelete="SET NULL",
    )

    op.drop_constraint("ck_payments_metadata_is_object", "payments", type_="check")
    op.drop_constraint("ck_payments_amount_positive", "payments", type_="check")
    op.create_check_constraint("ck_payments_amount_non_negative", "payments", "amount_minor >= 0")
    op.drop_index("ix_payments_status_initiated", table_name="payments")
    op.drop_index("ix_payments_order_initiated", table_name="payments")
    op.drop_index("uq_payments_order_succeeded", table_name="payments")
    op.drop_index("uq_payments_provider_reference", table_name="payments")
    op.drop_constraint("uq_payments_idempotency_key", "payments", type_="unique")
    op.execute("ALTER TABLE payments ALTER COLUMN status DROP DEFAULT")
    op.drop_column("payments", "processed_at")
    op.drop_column("payments", "initiated_at")
    op.drop_column("payments", "provider_metadata")
    op.drop_column("payments", "failure_message")
    op.drop_column("payments", "failure_code")
    op.drop_column("payments", "simulated_outcome")
    op.drop_column("payments", "idempotency_key")
    op.drop_column("payments", "provider_reference")
    op.add_column("payments", sa.Column("provider_ref", sa.String(255), nullable=True))
    op.add_column("payments", sa.Column("authorized_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payments", sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payments", sa.Column("failure_reason", sa.Text(), nullable=True))
    op.add_column(
        "payments",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.add_column(
        "payments",
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.execute("ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'PENDING'::payment_status")
    op.create_unique_constraint("uq_payments_provider_ref", "payments", ["provider_ref"])
    op.create_index("ix_payments_order_id", "payments", ["order_id"], unique=False)
    op.create_index("ix_payments_status", "payments", ["status"], unique=False)

    op.drop_constraint("ck_orders_source_consistent", "orders", type_="check")
    op.drop_constraint("ck_orders_total_matches_parts", "orders", type_="check")
    op.drop_constraint("ck_orders_total_non_negative", "orders", type_="check")
    op.drop_constraint("ck_orders_shipping_non_negative", "orders", type_="check")
    op.drop_constraint("ck_orders_subtotal_non_negative", "orders", type_="check")
    op.drop_constraint("ck_orders_buyer_not_seller", "orders", type_="check")
    op.drop_constraint("uq_orders_auction_result_id", "orders", type_="unique")
    op.drop_constraint("uq_orders_accepted_offer_id", "orders", type_="unique")
    op.drop_constraint("uq_orders_listing_id", "orders", type_="unique")
    op.drop_column("orders", "cancelled_at")
    op.drop_column("orders", "paid_at")
    op.alter_column("orders", "shipping_minor", server_default=None)
    op.drop_column("orders", "total_minor")
    op.drop_column("orders", "shipping_minor")
    op.drop_column("orders", "subtotal_minor")
    op.drop_column("orders", "contact_email_normalized")
    op.drop_column("orders", "listing_title_snapshot")
    op.drop_constraint("fk_orders_auction_result_id", "orders", type_="foreignkey")
    op.drop_column("orders", "auction_result_id")
    op.drop_constraint("fk_orders_accepted_offer_id", "orders", type_="foreignkey")
    op.drop_column("orders", "accepted_offer_id")
    op.add_column("orders", sa.Column("amount_minor", sa.BigInteger(), nullable=True))
    op.add_column("orders", sa.Column("quantity", sa.Integer(), server_default="1", nullable=False))
    op.add_column("orders", sa.Column("offer_id", sa.UUID(), nullable=True))
    op.add_column("orders", sa.Column("auction_id", sa.UUID(), nullable=True))
    op.execute("UPDATE orders SET amount_minor = 0 WHERE amount_minor IS NULL")
    op.alter_column("orders", "amount_minor", nullable=False)
    op.create_foreign_key("fk_orders_offer_id", "orders", "offers", ["offer_id"], ["id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_orders_auction_id", "orders", "auctions", ["auction_id"], ["id"], ondelete="RESTRICT")
    op.create_check_constraint("ck_orders_amount_non_negative", "orders", "amount_minor >= 0")
    op.create_check_constraint("ck_orders_quantity", "orders", "quantity >= 1")
    op.create_check_constraint(
        "ck_orders_source_consistent", "orders",
        "(source = 'FIXED_PRICE' AND offer_id IS NULL AND auction_id IS NULL) OR "
        "(source = 'ACCEPTED_OFFER' AND offer_id IS NOT NULL AND auction_id IS NULL) OR "
        "(source = 'AUCTION_WIN' AND auction_id IS NOT NULL AND offer_id IS NULL)",
    )
