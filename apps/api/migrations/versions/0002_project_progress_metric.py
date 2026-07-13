"""Persist the project progress metric selection.

Revision ID: 0002_project_progress_metric
Revises: 0001_initial
"""

import sqlalchemy as sa
from alembic import op


revision = "0002_project_progress_metric"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("projects")}
    if "progress_metric_key" not in columns:
        op.add_column("projects", sa.Column("progress_metric_key", sa.String(length=120), nullable=False, server_default="validation_loss"))
    if "progress_metric_direction" not in columns:
        op.add_column("projects", sa.Column("progress_metric_direction", sa.String(length=32), nullable=False, server_default="lower_is_better"))


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("projects")}
    if "progress_metric_direction" in columns:
        op.drop_column("projects", "progress_metric_direction")
    if "progress_metric_key" in columns:
        op.drop_column("projects", "progress_metric_key")
