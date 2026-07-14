import json

from runtrace.credentials import DEFAULT_DEV_API_TOKEN, load_credentials, resolve_connection, save_credentials


def test_local_development_has_a_known_default_connection(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNTRACE_CREDENTIALS_FILE", str(tmp_path / "missing.json"))
    monkeypatch.delenv("RUNTRACE_BASE_URL", raising=False)
    monkeypatch.delenv("RUNTRACE_API_TOKEN", raising=False)
    monkeypatch.delenv("RUNTRACE_API_KEY", raising=False)

    assert resolve_connection() == ("http://localhost:8000", DEFAULT_DEV_API_TOKEN)


def test_remote_connection_does_not_reuse_the_development_token(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNTRACE_CREDENTIALS_FILE", str(tmp_path / "missing.json"))
    monkeypatch.setenv("RUNTRACE_BASE_URL", "https://trace.example")
    monkeypatch.delenv("RUNTRACE_API_TOKEN", raising=False)
    monkeypatch.delenv("RUNTRACE_API_KEY", raising=False)

    assert resolve_connection() == ("https://trace.example", None)


def test_credentials_round_trip_with_private_permissions(monkeypatch, tmp_path):
    path = tmp_path / "runtrace" / "credentials.json"
    monkeypatch.setenv("RUNTRACE_CREDENTIALS_FILE", str(path))

    assert save_credentials("https://trace.example/", "rt_secret") == path
    assert load_credentials() == {
        "base_url": "https://trace.example",
        "api_token": "rt_secret",
    }
    assert path.stat().st_mode & 0o777 == 0o600
    assert json.loads(path.read_text())["api_token"] == "rt_secret"


def test_environment_overrides_saved_credentials(monkeypatch, tmp_path):
    path = tmp_path / "credentials.json"
    path.write_text(json.dumps({
        "base_url": "https://saved.example",
        "api_token": "rt_saved",
    }))
    monkeypatch.setenv("RUNTRACE_CREDENTIALS_FILE", str(path))
    monkeypatch.setenv("RUNTRACE_BASE_URL", "https://environment.example/")
    monkeypatch.setenv("RUNTRACE_API_TOKEN", "rt_environment")

    assert resolve_connection() == ("https://environment.example", "rt_environment")


def test_explicit_connection_overrides_environment(monkeypatch):
    monkeypatch.setenv("RUNTRACE_BASE_URL", "https://environment.example")
    monkeypatch.setenv("RUNTRACE_API_TOKEN", "rt_environment")

    assert resolve_connection("https://explicit.example/", "rt_explicit") == (
        "https://explicit.example",
        "rt_explicit",
    )
