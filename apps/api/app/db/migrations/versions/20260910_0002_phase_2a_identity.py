"""phase 2a identity foundation

Revision ID: 20260910_0002
Revises: 20260909_0001
Create Date: 2026-09-10

Tables: roles, users, user_roles, user_profiles,
auth_refresh_tokens, account_action_tokens.
Seeds static roles: BUYER, SELLER, ADMIN.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260910_0002"
down_revision: str | Sequence[str] | None = "20260909_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "name",
            postgresql.ENUM("BUYER", "SELLER", "ADMIN", name="role_name"),
            nullable=False,
        ),
        sa.Column("description", sa.Text(), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_roles_name"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "DELETED", name="user_status"
            ),
            server_default="PENDING_VERIFICATION",
            nullable=False,
        ),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
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
            "char_length(email) >= 3 AND position('@' IN email) > 1",
            name="ck_users_email_format",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_status", "users", ["status"], unique=False)
    op.create_table(
        "account_action_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "purpose",
            postgresql.ENUM(
                "EMAIL_VERIFICATION",
                "PASSWORD_RESET",
                name="account_action_purpose",
            ),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "PENDING", "USED", "EXPIRED", "REVOKED",
                name="account_action_status",
            ),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
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
            "used_at IS NULL OR status = 'USED'",
            name="ck_account_action_tokens_used_consistent",
        ),
        sa.CheckConstraint(
            "char_length(token_hash) >= 32",
            name="ck_account_action_tokens_token_hash",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_account_action_tokens_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_account_action_tokens_token_hash"),
    )
    op.create_index(
        "ix_account_action_tokens_expires_at",
        "account_action_tokens",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_account_action_tokens_status",
        "account_action_tokens",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_account_action_tokens_user_id",
        "account_action_tokens",
        ["user_id"],
        unique=False,
    )
    op.create_table(
        "auth_refresh_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "ACTIVE", "REVOKED", "EXPIRED", name="refresh_token_status"
            ),
            server_default="ACTIVE",
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
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
            "char_length(token_hash) >= 32",
            name="ck_auth_refresh_tokens_token_hash",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_auth_refresh_tokens_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_auth_refresh_tokens_token_hash"),
    )
    op.create_index(
        "ix_auth_refresh_tokens_expires_at",
        "auth_refresh_tokens",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_auth_refresh_tokens_status",
        "auth_refresh_tokens",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_auth_refresh_tokens_user_id",
        "auth_refresh_tokens",
        ["user_id"],
        unique=False,
    )
    op.create_table(
        "user_profiles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column("first_name", sa.String(length=120), nullable=True),
        sa.Column("last_name", sa.String(length=120), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
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
            "bio IS NULL OR char_length(bio) <= 2000",
            name="ck_user_profiles_bio_length",
        ),
        sa.CheckConstraint(
            "display_name IS NULL OR char_length(display_name) >= 2",
            name="ck_user_profiles_display_name",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_user_profiles_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_user_profiles_user_id"),
    )
    op.create_table(
        "user_roles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
            name="fk_user_roles_role_id",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_user_roles_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "role_id", name="uq_user_roles_user_role"
        ),
    )
    op.create_index(
        "ix_user_roles_role_id", "user_roles", ["role_id"], unique=False
    )
    op.create_index("ix_user_roles_user_id", "user_roles", ["user_id"], unique=False)

    # Seed static roles so buyer/seller/admin can be assigned independently.
    op.execute(
        sa.text(
            "INSERT INTO roles (id, name, description) VALUES "
            "(gen_random_uuid(), 'BUYER', 'Can purchase listings'), "
            "(gen_random_uuid(), 'SELLER', 'Can create listings'), "
            "(gen_random_uuid(), 'ADMIN', 'Platform administration')"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_user_roles_user_id", table_name="user_roles")
    op.drop_index("ix_user_roles_role_id", table_name="user_roles")
    op.drop_table("user_roles")
    op.drop_table("user_profiles")
    op.drop_index(
        "ix_auth_refresh_tokens_user_id", table_name="auth_refresh_tokens"
    )
    op.drop_index("ix_auth_refresh_tokens_status", table_name="auth_refresh_tokens")
    op.drop_index(
        "ix_auth_refresh_tokens_expires_at", table_name="auth_refresh_tokens"
    )
    op.drop_table("auth_refresh_tokens")
    op.drop_index(
        "ix_account_action_tokens_user_id", table_name="account_action_tokens"
    )
    op.drop_index(
        "ix_account_action_tokens_status", table_name="account_action_tokens"
    )
    op.drop_index(
        "ix_account_action_tokens_expires_at", table_name="account_action_tokens"
    )
    op.drop_table("account_action_tokens")
    op.drop_index("ix_users_status", table_name="users")
    op.drop_table("users")
    op.drop_table("roles")
    for enum_name in (
        "role_name",
        "user_status",
        "refresh_token_status",
        "account_action_purpose",
        "account_action_status",
    ):
        op.execute(sa.text(f"DROP TYPE IF EXISTS {enum_name}"))
