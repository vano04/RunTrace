"""Track completion of the identity onboarding tour.

Revision ID: 0012_identity_onboarding
Revises: 0011_result_visualization_types
"""

from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op


revision = "0012_identity_onboarding"
down_revision = "0011_result_visualization_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("identities")}
    if "onboarding_completed_at" in columns:
        return
    op.add_column("identities", sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True))

    # Existing installations are already configured; do not interrupt them with
    # a first-run tour after upgrading.
    identities = sa.table("identities", sa.column("onboarding_completed_at", sa.DateTime(timezone=True)))
    bind.execute(identities.update().values(onboarding_completed_at=datetime.now(timezone.utc)))


def downgrade() -> None:
    op.drop_column("identities", "onboarding_completed_at")
