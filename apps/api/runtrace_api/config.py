from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RUNTRACE_", env_file=ROOT / ".env", extra="ignore")

    database_url: str = f"sqlite:///{ROOT / 'data' / 'runtrace.db'}"
    artifact_path: Path = ROOT / "data" / "artifacts"
    cors_origins: str = "http://localhost:5173,http://localhost:4173,http://localhost:3000"
    seed_demo: bool = True
    max_artifact_size: int = 10 * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
