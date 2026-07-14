import sqlite3
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
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    assert {"progress_metric_key", "progress_metric_direction"}.issubset(columns)
    assert "search_documents" in tables
    assert "tag_definitions" in tables
    assert {"identities", "passkey_credentials", "auth_sessions", "auth_ceremonies", "api_tokens"}.issubset(tables)
    assert revision == "0006_api_tokens"
