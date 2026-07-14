"""Add instance identities, passkeys, sessions, and WebAuthn ceremonies.

Revision ID: 0005_instance_auth
Revises: 0004_tag_registry
"""

import sqlalchemy as sa
from alembic import op


revision = "0005_instance_auth"
down_revision = "0004_tag_registry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "identities" in sa.inspect(bind).get_table_names():
        return

    op.create_table(
        "identities",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("setup_token_hash", sa.String(length=64), nullable=True),
        sa.Column("setup_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("setup_token_hash"),
    )
    op.create_index("ix_identities_name", "identities", ["name"])
    op.create_index("ix_identities_role", "identities", ["role"])
    op.create_index("ix_identities_status", "identities", ["status"])
    op.create_index(
        "uq_identities_single_owner",
        "identities",
        ["role"],
        unique=True,
        postgresql_where=sa.text("role = 'owner'"),
        sqlite_where=sa.text("role = 'owner'"),
    )

    op.create_table(
        "passkey_credentials",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("identity_id", sa.String(length=64), nullable=False),
        sa.Column("credential_id", sa.LargeBinary(), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.Integer(), nullable=False),
        sa.Column("device_type", sa.String(length=32), nullable=False),
        sa.Column("backed_up", sa.Boolean(), nullable=False),
        sa.Column("transports", sa.JSON(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["identity_id"], ["identities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("credential_id"),
    )
    op.create_index("ix_passkey_credentials_identity_id", "passkey_credentials", ["identity_id"])

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("identity_id", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["identity_id"], ["identities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_auth_sessions_identity_id", "auth_sessions", ["identity_id"])
    op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"])
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])

    op.create_table(
        "auth_ceremonies",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("ceremony", sa.String(length=32), nullable=False),
        sa.Column("challenge", sa.LargeBinary(), nullable=False),
        sa.Column("identity_id", sa.String(length=64), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["identity_id"], ["identities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_ceremonies_ceremony", "auth_ceremonies", ["ceremony"])
    op.create_index("ix_auth_ceremonies_identity_id", "auth_ceremonies", ["identity_id"])
    op.create_index("ix_auth_ceremonies_expires_at", "auth_ceremonies", ["expires_at"])


def downgrade() -> None:
    op.drop_table("auth_ceremonies")
    op.drop_table("auth_sessions")
    op.drop_table("passkey_credentials")
    op.drop_table("identities")
