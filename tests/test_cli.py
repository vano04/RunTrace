import json
from contextlib import contextmanager

from typer.testing import CliRunner

from runtrace import cli


runner = CliRunner()


class FakeRun:
    def __init__(self):
        self.metrics = []
        self.events = []
        self.finished = None
        self.aborted = None

    def __enter__(self): return self
    def __exit__(self, *_): return False
    def log_metric(self, *args): self.metrics.append(args)
    def log_event(self, *args): self.events.append(args)
    def finish(self, *args, **kwargs): self.finished = (args, kwargs)
    def abort(self, reason): self.aborted = reason


class FakeClient:
    def __init__(self):
        self.tracked = FakeRun()

    def search(self, project, query, limit):
        return {"project": project, "query": query, "limit": limit}

    def request(self, method, path):
        return {"method": method, "path": path}

    def run(self, *_args, **_kwargs):
        return self.tracked


def test_cli_search_and_context_commands(monkeypatch):
    fake = FakeClient()
    monkeypatch.setattr(cli, "client", lambda _base_url, _api_token: fake)
    search = runner.invoke(cli.app, ["search", "dense-optimizer", "spectral", "--limit", "3"])
    context = runner.invoke(cli.app, ["context", "dense-optimizer"])
    assert search.exit_code == 0
    assert json.loads(search.stdout)["limit"] == 3
    assert context.exit_code == 0
    assert json.loads(context.stdout)["path"].endswith("/context")


def test_cli_exec_parses_metric_and_event_output(monkeypatch):
    fake = FakeClient()
    monkeypatch.setattr(cli, "client", lambda _base_url, _api_token: fake)

    class Process:
        stdout = iter(["RUNTRACE_METRIC loss=3.2 step=10\n", 'RUNTRACE_EVENT level=warning message="Guardrail near"\n'])
        def wait(self): return 0

    monkeypatch.setattr(cli.subprocess, "Popen", lambda *_args, **_kwargs: Process())
    result = runner.invoke(cli.app, ["exec", "--project", "dense-optimizer", "--name", "CLI run", "--hypothesis", "Faster", "--", "python", "bench.py"])
    assert result.exit_code == 0
    assert fake.tracked.metrics == [("loss", 3.2, 10)]
    assert fake.tracked.events == [("Guardrail near", "warning")]
    assert fake.tracked.finished[0] == ("undecided",)


def test_cli_exec_propagates_process_failure(monkeypatch):
    fake = FakeClient()
    monkeypatch.setattr(cli, "client", lambda _base_url, _api_token: fake)

    class Process:
        stdout = iter([])
        def wait(self): return 7

    monkeypatch.setattr(cli.subprocess, "Popen", lambda *_args, **_kwargs: Process())
    result = runner.invoke(cli.app, ["exec", "--project", "dense-optimizer", "--name", "CLI run", "--hypothesis", "Faster", "--", "false"])
    assert result.exit_code == 7
    assert fake.tracked.aborted == "Command exited 7"


def test_cli_integration_installer_supports_codex_and_claude(monkeypatch):
    calls = []
    monkeypatch.setattr(cli.shutil, "which", lambda host: f"/usr/bin/{host}")
    monkeypatch.setattr(cli.subprocess, "run", lambda command, check: calls.append((command, check)))

    codex = runner.invoke(cli.app, ["integrations", "install", "codex"])
    claude = runner.invoke(cli.app, ["integrations", "install", "claude"])

    assert codex.exit_code == 0
    assert claude.exit_code == 0
    assert calls[0][0][:4] == ["codex", "plugin", "marketplace", "add"]
    assert calls[1][0] == ["codex", "plugin", "add", "runtrace@runtrace"]
    assert calls[3][0][:4] == ["claude", "plugin", "install", "runtrace@runtrace"]
