import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


SOURCE_ROOT = Path(__file__).resolve().parents[3]
ROOT = SOURCE_ROOT if (SOURCE_ROOT / "alembic.ini").exists() else Path(os.getenv("RUNTRACE_ROOT", Path.cwd())).resolve()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RUNTRACE_", env_file=ROOT / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg://runtrace:runtrace@localhost:5432/runtrace"
    artifact_path: Path = ROOT / "data" / "artifacts"
    cors_origins: str = "http://localhost:5173,http://localhost:4173,http://localhost:3000"
    seed_demo: bool = False
    auto_migrate: bool = True
    max_artifact_size: int = 10 * 1024 * 1024
    embeddings_enabled: bool = True
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_cache_path: Path = ROOT / "data" / "models"
    claim_timeout_seconds: int = 300
    dev: bool = False
    secure_session_cookie: bool = False
    owner_recovery_password: str = ""
    session_ttl_hours: int = 168
    setup_link_ttl_hours: int = 24

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

settings = Settings()
