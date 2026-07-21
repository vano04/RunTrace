"""Add a per-identity locale preference.

Revision ID: 0013_identity_locale
Revises: 0012_identity_onboarding
"""

import sqlalchemy as sa
from alembic import op


revision = "0013_identity_locale"
down_revision = "0012_identity_onboarding"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("identities")}
    if "locale" not in columns:
        op.add_column("identities", sa.Column("locale", sa.String(length=16), nullable=False, server_default="en"))


def downgrade() -> None:
    op.drop_column("identities", "locale")
