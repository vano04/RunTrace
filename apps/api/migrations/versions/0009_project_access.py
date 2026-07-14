"""Add project memberships and project-scoped API tokens.

Revision ID: 0009_project_access
Revises: 0008_identity_usernames
"""

from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op


revision = "0009_project_access"
down_revision = "0008_identity_usernames"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if {"project_memberships", "api_token_projects"}.issubset(existing):
        return
    op.create_table(
        "project_memberships",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("project_id", sa.String(length=64), nullable=False),
        sa.Column("identity_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["identity_id"], ["identities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "identity_id"),
    )
    op.create_index("ix_project_memberships_project_id", "project_memberships", ["project_id"])
    op.create_index("ix_project_memberships_identity_id", "project_memberships", ["identity_id"])
    op.create_index("ix_project_memberships_role", "project_memberships", ["role"])
    op.create_table(
        "api_token_projects",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("api_token_id", sa.String(length=64), nullable=False),
        sa.Column("project_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["api_token_id"], ["api_tokens.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("api_token_id", "project_id"),
    )
    op.create_index("ix_api_token_projects_api_token_id", "api_token_projects", ["api_token_id"])
    op.create_index("ix_api_token_projects_project_id", "api_token_projects", ["project_id"])

    # Existing installations previously granted every token instance-wide access.
    bind = op.get_bind()
    projects = sa.table("projects", sa.column("id", sa.String))
    identities = sa.table("identities", sa.column("id", sa.String), sa.column("role", sa.String))
    memberships = sa.table(
        "project_memberships",
        sa.column("id", sa.String), sa.column("project_id", sa.String), sa.column("identity_id", sa.String),
        sa.column("role", sa.String), sa.column("created_at", sa.DateTime), sa.column("updated_at", sa.DateTime),
    )
    tokens = sa.table("api_tokens", sa.column("id", sa.String))
    grants = sa.table("api_token_projects", sa.column("id", sa.String), sa.column("api_token_id", sa.String), sa.column("project_id", sa.String))
    now = datetime.now(timezone.utc)
    owner_ids = [row[0] for row in bind.execute(sa.select(identities.c.id).where(identities.c.role == "owner"))]
    project_ids = [row[0] for row in bind.execute(sa.select(projects.c.id))]
    token_ids = [row[0] for row in bind.execute(sa.select(tokens.c.id))]
    if owner_ids:
        bind.execute(memberships.insert(), [
            {"id": f"membership_migration_{index}", "project_id": project_id, "identity_id": owner_ids[0], "role": "owner", "created_at": now, "updated_at": now}
            for index, project_id in enumerate(project_ids)
        ])
    if token_ids and project_ids:
        bind.execute(grants.insert(), [
            {"id": f"tokenproject_migration_{index}", "api_token_id": token_id, "project_id": project_id}
            for index, (token_id, project_id) in enumerate((t, p) for t in token_ids for p in project_ids)
        ])


def downgrade() -> None:
    op.drop_table("api_token_projects")
    op.drop_table("project_memberships")
