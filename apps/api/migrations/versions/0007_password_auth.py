"""Add password authentication to identities.

Revision ID: 0007_password_auth
Revises: 0006_api_tokens
"""

import sqlalchemy as sa
from alembic import op


revision = "0007_password_auth"
down_revision = "0006_api_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("identities")}
    if "password_hash" not in columns:
        op.add_column("identities", sa.Column("password_hash", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("identities", "password_hash")
