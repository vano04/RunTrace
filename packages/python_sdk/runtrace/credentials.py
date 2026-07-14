from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "http://localhost:8000"
DEFAULT_DEV_API_TOKEN = "rt_runtrace_dev"


def credentials_path() -> Path:
    override = os.getenv("RUNTRACE_CREDENTIALS_FILE")
    if override:
        return Path(override).expanduser()
    config_home = Path(os.getenv("XDG_CONFIG_HOME", Path.home() / ".config"))
    return config_home / "runtrace" / "credentials.json"


def load_credentials() -> dict[str, str]:
    try:
        payload: Any = json.loads(credentials_path().read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict):
        return {}
    return {
        key: value
        for key in ("base_url", "api_token")
        if isinstance((value := payload.get(key)), str) and value
    }


def resolve_connection(
    base_url: str | None = None,
    api_token: str | None = None,
) -> tuple[str, str | None]:
    saved = load_credentials()
    resolved_base_url = (
        base_url
        or os.getenv("RUNTRACE_BASE_URL")
        or saved.get("base_url")
        or DEFAULT_BASE_URL
    )
    resolved_api_token = (
        api_token
        or os.getenv("RUNTRACE_API_TOKEN")
        or os.getenv("RUNTRACE_API_KEY")
        or saved.get("api_token")
        or (DEFAULT_DEV_API_TOKEN if resolved_base_url.rstrip("/") == DEFAULT_BASE_URL else None)
    )
    return resolved_base_url.rstrip("/"), resolved_api_token


def save_credentials(base_url: str, api_token: str) -> Path:
    path = credentials_path()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        path.parent.chmod(0o700)
    except OSError:
        pass

    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=path.parent,
            prefix=".credentials-",
            delete=False,
        ) as temporary:
            temporary_name = temporary.name
            json.dump({"base_url": base_url.rstrip("/"), "api_token": api_token}, temporary)
            temporary.write("\n")
            temporary.flush()
            os.fsync(temporary.fileno())
        os.chmod(temporary_name, 0o600)
        os.replace(temporary_name, path)
    finally:
        if temporary_name:
            try:
                Path(temporary_name).unlink()
            except FileNotFoundError:
                pass
    return path
