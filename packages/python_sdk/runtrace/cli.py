from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from typing import Annotated

import typer

from .client import RunTrace


app = typer.Typer(no_args_is_help=True, help="Track experiments and query RunTrace memory.")
integrations_app = typer.Typer(no_args_is_help=True, help="Install RunTrace in supported agent CLIs.")
app.add_typer(integrations_app, name="integrations")


def client(base_url: str, api_token: str | None) -> RunTrace:
    return RunTrace(base_url=base_url, api_token=api_token, strict=True)


@app.command()
def search(
    project: str,
    query: str,
    base_url: str = typer.Option("http://localhost:8000", envvar="RUNTRACE_BASE_URL"),
    api_token: str | None = typer.Option(None, envvar="RUNTRACE_API_TOKEN", hidden=True),
    limit: int = 10,
) -> None:
    result = client(base_url, api_token).search(project, query, limit)
    typer.echo(json.dumps(result, indent=2, default=str))


@app.command("context")
def context_command(
    project: str,
    base_url: str = typer.Option("http://localhost:8000", envvar="RUNTRACE_BASE_URL"),
    api_token: str | None = typer.Option(None, envvar="RUNTRACE_API_TOKEN", hidden=True),
) -> None:
    result = client(base_url, api_token).request("GET", f"/api/v1/projects/{project}/context")
    typer.echo(json.dumps(result, indent=2, default=str))


@app.command(
    context_settings={"allow_extra_args": True, "ignore_unknown_options": True},
    help="Run a command and track structured RUNTRACE_METRIC/RUNTRACE_EVENT output.",
)
def exec(
    ctx: typer.Context,
    project: str = typer.Option(...),
    name: str = typer.Option(...),
    hypothesis: str = typer.Option(...),
    reasoning: str = typer.Option(""),
    base_url: str = typer.Option("http://localhost:8000", envvar="RUNTRACE_BASE_URL"),
    api_token: str | None = typer.Option(None, envvar="RUNTRACE_API_TOKEN", hidden=True),
) -> None:
    command = list(ctx.args)
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise typer.BadParameter("Provide a command after --")
    rt = client(base_url, api_token)
    with rt.run(project, name, hypothesis, reasoning, command=" ".join(command)) as tracked:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        assert process.stdout
        metric_pattern = re.compile(r"^RUNTRACE_METRIC\s+(\S+)=([+-]?[\d.]+)(?:\s+step=(\d+))?")
        event_pattern = re.compile(r'^RUNTRACE_EVENT(?:\s+level=(\w+))?\s+message=["\']?(.*?)["\']?$')
        for line in process.stdout:
            sys.stdout.write(line)
            if match := metric_pattern.match(line.strip()):
                tracked.log_metric(match.group(1), float(match.group(2)), int(match.group(3)) if match.group(3) else None)
            elif match := event_pattern.match(line.strip()):
                tracked.log_event(match.group(2), match.group(1) or "info")
        code = process.wait()
        if code == 0:
            tracked.finish("undecided", result_summary="Command completed successfully")
        else:
            tracked.abort(f"Command exited {code}")
            raise typer.Exit(code)


@integrations_app.command("install")
def install_integration(
    host: Annotated[str, typer.Argument(help="Agent CLI to configure: codex or claude")],
    ref: str = typer.Option("master", help="RunTrace Git ref to install."),
    dry_run: bool = typer.Option(False, help="Print commands without changing host configuration."),
) -> None:
    """Install the RunTrace plugin from its public repository marketplace."""
    host = host.lower()
    if host not in {"codex", "claude"}:
        raise typer.BadParameter("Host must be 'codex' or 'claude'")
    if not shutil.which(host):
        raise typer.BadParameter(f"{host} is not installed or is not on PATH")
    if host == "codex":
        commands = [
            ["codex", "plugin", "marketplace", "add", "vano04/RunTrace", "--ref", ref],
            ["codex", "plugin", "add", "runtrace@runtrace"],
        ]
    else:
        commands = [
            ["claude", "plugin", "marketplace", "add", "vano04/RunTrace"],
            ["claude", "plugin", "install", "runtrace@runtrace", "--scope", "user"],
        ]
    for command in commands:
        typer.echo("$ " + " ".join(command))
        if not dry_run:
            subprocess.run(command, check=True)
    typer.echo(
        "RunTrace plugin installed. Export RUNTRACE_BASE_URL and RUNTRACE_API_TOKEN "
        "before starting the agent CLI."
    )


if __name__ == "__main__":
    app()
