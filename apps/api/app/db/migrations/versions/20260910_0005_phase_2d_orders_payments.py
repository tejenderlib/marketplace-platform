"""phase 2d orders and payments foundation

Revision ID: 20260910_0005
Revises: 20260910_0004
Create Date: 2026-09-10

Tables: user_addresses, orders, order_shipping_addresses, shipments,
order_status_history, payments.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260910_0005"
down_revision: str | Sequence[str] | None = "20260910_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_addresses",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("label", sa.String(length=60), nullable=True),
        sa.Column("recipient_name", sa.String(length=200), nullable=False),
        sa.Column("line1", sa.String(length=300), nullable=False),
        sa.Column("line2", sa.String(length=300), nullable=True),
        sa.Column("city", sa.String(length=160), nullable=False),
        sa.Column("region", sa.String(length=160), nullable=True),
        sa.Column("postal_code", sa.String(length=40), nullable=True),
        sa.Column("country", sa.CHAR(length=2), nullable=False),
        sa.Column("phone", sa.String(length=60), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM("ACTIVE", "INACTIVE", name="address_status"),
            server_default="ACTIVE",
            nullable=False,
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
            "country ~ '^[A-Z]{2}$'", name="ck_user_addresses_country_iso3166"
        ),
        sa.CheckConstraint(
            "char_length(city) >= 2", name="ck_user_addresses_city"
        ),
        sa.CheckConstraint(
            "char_length(line1) >= 2", name="ck_user_addresses_line1"
        ),
        sa.CheckConstraint(
            "char_length(recipient_name) >= 2",
            name="ck_user_addresses_recipient",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_user_addresses_user_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_addresses_status", "user_addresses", ["status"], unique=False
    )
    op.create_index(
        "ix_user_addresses_user_id", "user_addresses", ["user_id"], unique=False
    )
    op.create_table(
        "orders",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("buyer_id", sa.UUID(), nullable=False),
        sa.Column("seller_id", sa.UUID(), nullable=False),
        sa.Column("listing_id", sa.UUID(), nullable=False),
        sa.Column("offer_id", sa.UUID(), nullable=True),
        sa.Column("auction_id", sa.UUID(), nullable=True),
        sa.Column(
            "source",
            postgresql.ENUM(
                "FIXED_PRICE", "ACCEPTED_OFFER", "AUCTION_WIN", name="order_source"
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(
                "PENDING_PAYMENT",
                "PAYMENT_FAILED",
                "PAID",
                "PROCESSING",
                "READY_FOR_DELIVERY",
                "SHIPPED",
                "DELIVERED",
                "CANCELLED",
                "REFUNDED",
                name="order_status",
            ),
            server_default="PENDING_PAYMENT",
            nullable=False,
        ),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column("quantity", sa.Integer(), server_default="1", nullable=False),
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
            "(source = 'FIXED_PRICE' AND offer_id IS NULL AND auction_id IS NULL) OR "
            "(source = 'ACCEPTED_OFFER' AND offer_id IS NOT NULL AND auction_id IS NULL) OR "
            "(source = 'AUCTION_WIN' AND auction_id IS NOT NULL AND offer_id IS NULL)",
            name="ck_orders_source_consistent",
        ),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name="ck_orders_currency_iso4217"
        ),
        sa.CheckConstraint(
            "amount_minor >= 0", name="ck_orders_amount_non_negative"
        ),
        sa.CheckConstraint("quantity >= 1", name="ck_orders_quantity"),
        sa.ForeignKeyConstraint(
            ["auction_id"],
            ["auctions.id"],
            name="fk_orders_auction_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["buyer_id"],
            ["users.id"],
            name="fk_orders_buyer_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
            name="fk_orders_listing_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["offer_id"],
            ["offers.id"],
            name="fk_orders_offer_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["seller_id"],
            ["users.id"],
            name="fk_orders_seller_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_orders_buyer_id", "orders", ["buyer_id"], unique=False)
    op.create_index(
        "ix_orders_listing_id", "orders", ["listing_id"], unique=False
    )
    op.create_index("ix_orders_seller_id", "orders", ["seller_id"], unique=False)
    op.create_index("ix_orders_status", "orders", ["status"], unique=False)
    op.create_table(
        "order_shipping_addresses",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column("source_address_id", sa.UUID(), nullable=True),
        sa.Column("recipient_name", sa.String(length=200), nullable=False),
        sa.Column("line1", sa.String(length=300), nullable=False),
        sa.Column("line2", sa.String(length=300), nullable=True),
        sa.Column("city", sa.String(length=160), nullable=False),
        sa.Column("region", sa.String(length=160), nullable=True),
        sa.Column("postal_code", sa.String(length=40), nullable=True),
        sa.Column("country", sa.CHAR(length=2), nullable=False),
        sa.Column("phone", sa.String(length=60), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "country ~ '^[A-Z]{2}$'",
            name="ck_order_shipping_addresses_country_iso3166",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name="fk_order_shipping_addresses_order_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_address_id"],
            ["user_addresses.id"],
            name="fk_order_shipping_addresses_source_address_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "order_id", name="uq_order_shipping_addresses_order_id"
        ),
    )
    op.create_table(
        "order_status_history",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column(
            "from_status",
            postgresql.ENUM(
                "PENDING_PAYMENT",
                "PAYMENT_FAILED",
                "PAID",
                "PROCESSING",
                "READY_FOR_DELIVERY",
                "SHIPPED",
                "DELIVERED",
                "CANCELLED",
                "REFUNDED",
                name="order_status",
            ),
            nullable=True,
        ),
        sa.Column(
            "to_status",
            postgresql.ENUM(
                "PENDING_PAYMENT",
                "PAYMENT_FAILED",
                "PAID",
                "PROCESSING",
                "READY_FOR_DELIVERY",
                "SHIPPED",
                "DELIVERED",
                "CANCELLED",
                "REFUNDED",
                name="order_status",
            ),
            nullable=False,
        ),
        sa.Column("changed_by", sa.UUID(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["changed_by"],
            ["users.id"],
            name="fk_order_status_history_changed_by",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name="fk_order_status_history_order_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_order_status_history_order_id",
        "order_status_history",
        ["order_id"],
        unique=False,
    )
    op.create_table(
        "payments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column(
            "provider",
            postgresql.ENUM("DUMMY", name="payment_provider"),
            server_default="DUMMY",
            nullable=False,
        ),
        sa.Column("provider_ref", sa.String(length=255), nullable=True),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "CREATED",
                "PENDING",
                "SUCCEEDED",
                "FAILED",
                "CANCELLED",
                name="payment_status",
            ),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column("authorized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
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
            "currency ~ '^[A-Z]{3}$'", name="ck_payments_currency_iso4217"
        ),
        sa.CheckConstraint(
            "amount_minor >= 0", name="ck_payments_amount_non_negative"
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name="fk_payments_order_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_ref", name="uq_payments_provider_ref"),
    )
    op.create_index(
        "ix_payments_order_id", "payments", ["order_id"], unique=False
    )
    op.create_index("ix_payments_status", "payments", ["status"], unique=False)
    op.create_table(
        "shipments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column("carrier", sa.String(length=120), nullable=True),
        sa.Column("tracking_number", sa.String(length=160), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "PENDING",
                "SHIPPED",
                "IN_TRANSIT",
                "DELIVERED",
                "FAILED",
                name="shipment_status",
            ),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column("shipped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
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
            "delivered_at IS NULL OR shipped_at IS NOT NULL",
            name="ck_shipments_delivery_consistent",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name="fk_shipments_order_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_shipments_order_id", "shipments", ["order_id"], unique=False
    )
    op.create_index("ix_shipments_status", "shipments", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_shipments_status", table_name="shipments")
    op.drop_index("ix_shipments_order_id", table_name="shipments")
    op.drop_table("shipments")
    op.drop_index("ix_payments_status", table_name="payments")
    op.drop_index("ix_payments_order_id", table_name="payments")
    op.drop_table("payments")
    op.drop_index(
        "ix_order_status_history_order_id", table_name="order_status_history"
    )
    op.drop_table("order_status_history")
    op.drop_table("order_shipping_addresses")
    op.drop_index("ix_orders_status", table_name="orders")
    op.drop_index("ix_orders_seller_id", table_name="orders")
    op.drop_index("ix_orders_listing_id", table_name="orders")
    op.drop_index("ix_orders_buyer_id", table_name="orders")
    op.drop_table("orders")
    op.drop_index("ix_user_addresses_user_id", table_name="user_addresses")
    op.drop_index("ix_user_addresses_status", table_name="user_addresses")
    op.drop_table("user_addresses")
    for enum_name in (
        "address_status",
        "order_source",
        "order_status",
        "shipment_status",
        "payment_provider",
        "payment_status",
    ):
        op.execute(sa.text(f"DROP TYPE IF EXISTS {enum_name}"))
