"""Add revocable API tokens for headless clients.

Revision ID: 0006_api_tokens
Revises: 0005_instance_auth
"""

import sqlalchemy as sa
from alembic import op


revision = "0006_api_tokens"
down_revision = "0005_instance_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "api_tokens" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "api_tokens",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("identity_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("token_prefix", sa.String(length=16), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["identity_id"], ["identities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_api_tokens_identity_id", "api_tokens", ["identity_id"])
    op.create_index("ix_api_tokens_token_hash", "api_tokens", ["token_hash"])
    op.create_index("ix_api_tokens_token_prefix", "api_tokens", ["token_prefix"])
    op.create_index("ix_api_tokens_expires_at", "api_tokens", ["expires_at"])


def downgrade() -> None:
    op.drop_table("api_tokens")
