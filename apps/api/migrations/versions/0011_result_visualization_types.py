"""Add reusable experiment result visualization types.

Revision ID: 0011_result_visualization_types
Revises: 0010_visualizations
"""

import sqlalchemy as sa
from alembic import op


revision = "0011_result_visualization_types"
down_revision = "0010_visualizations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "result_visualization_types" in existing:
        return
    op.create_table(
        "result_visualization_types",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("project_id", sa.String(length=64), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("spec_version", sa.Integer(), nullable=False),
        sa.Column("spec", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "key"),
    )
    op.create_index("ix_result_visualization_types_project_id", "result_visualization_types", ["project_id"])


def downgrade() -> None:
    op.drop_table("result_visualization_types")
