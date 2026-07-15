import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config

from runtrace_api.config import ROOT, settings


def test_existing_native_database_is_upgraded_to_current_schema(monkeypatch, tmp_path):
    database = tmp_path / "legacy.db"
    with sqlite3.connect(database) as connection:
        connection.execute(
            """CREATE TABLE projects (
                id VARCHAR(64) PRIMARY KEY,
                slug VARCHAR(120) NOT NULL UNIQUE,
                name VARCHAR(200) NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                repository_url VARCHAR(500),
                registry_endpoint VARCHAR(500) NOT NULL DEFAULT 'http://localhost:8000/api/v1',
                current_baseline_run_id VARCHAR(64),
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )"""
        )

    monkeypatch.setattr(settings, "database_url", f"sqlite:///{database}")
    migration_config = Config(str(ROOT / "alembic.ini"))
    command.upgrade(migration_config, "head")

    with sqlite3.connect(database) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(projects)")}
        identity_columns = {row[1] for row in connection.execute("PRAGMA table_info(identities)")}
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    assert {"progress_metric_key", "progress_metric_direction"}.issubset(columns)
    assert "search_documents" in tables
    assert "tag_definitions" in tables
    assert {"identities", "passkey_credentials", "auth_sessions", "auth_ceremonies", "api_tokens"}.issubset(tables)
    assert {"password_hash", "username"}.issubset(identity_columns)
    assert "name" not in identity_columns
    assert {"project_memberships", "api_token_projects"}.issubset(tables)
    assert revision == "0012_identity_onboarding"
    assert "onboarding_completed_at" in identity_columns
    assert "result_visualization_types" in tables
    assert "visualizations" in tables


def test_identity_names_are_migrated_to_unique_usernames(monkeypatch, tmp_path):
    database = tmp_path / "identity-migration.db"
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{database}")
    migration_config = Config(str(ROOT / "alembic.ini"))
    command.upgrade(migration_config, "0007_password_auth")

    now = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(database) as connection:
        connection.execute("ALTER TABLE identities RENAME COLUMN username TO name")
        connection.execute(
            "INSERT INTO identities (id, name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("identity_1", "Ada Lovelace", "owner", "active", now, now),
        )
        connection.execute(
            "INSERT INTO identities (id, name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("identity_2", "ada-lovelace", "member", "active", now, now),
        )

    command.upgrade(migration_config, "head")
    with sqlite3.connect(database) as connection:
        usernames = {row[0] for row in connection.execute("SELECT username FROM identities")}
    assert usernames == {"ada-lovelace", "ada-lovelace-2"}
