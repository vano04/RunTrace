"""Add the project-scoped tag registry.

Revision ID: 0004_tag_registry
Revises: 0003_vector_search
"""

from datetime import datetime, timezone
from uuid import uuid4

import sqlalchemy as sa
from alembic import op


revision = "0004_tag_registry"
down_revision = "0003_vector_search"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "tag_definitions" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "tag_definitions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("project_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("rule_key", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "name"),
    )
    op.create_index("ix_tag_definitions_project_id", "tag_definitions", ["project_id"])
    projects = bind.execute(sa.text("SELECT id FROM projects")).fetchall()
    now = datetime.now(timezone.utc)
    for (project_id,) in projects:
        bind.execute(
            sa.text("INSERT INTO tag_definitions (id, project_id, name, rule_key, created_at, updated_at) VALUES (:id, :project_id, :name, :rule_key, :created_at, :updated_at)"),
            [
                {"id": f"tag_{uuid4().hex}", "project_id": project_id, "name": "early stop", "rule_key": "autoresearch_early_stop", "created_at": now, "updated_at": now},
                {"id": f"tag_{uuid4().hex}", "project_id": project_id, "name": "long run", "rule_key": "autoresearch_long_run", "created_at": now, "updated_at": now},
            ],
        )


def downgrade() -> None:
    op.drop_table("tag_definitions")
