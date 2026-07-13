from __future__ import annotations

import json
import re
import subprocess
import sys
from typing import Annotated

import typer

from .client import RunTrace


app = typer.Typer(no_args_is_help=True, help="Track experiments and query RunTrace memory.")


def client(base_url: str) -> RunTrace:
    return RunTrace(base_url=base_url, strict=True)


@app.command()
def search(
    project: str,
    query: str,
    base_url: str = typer.Option("http://localhost:8000", envvar="RUNTRACE_BASE_URL"),
    limit: int = 10,
) -> None:
    result = client(base_url).search(project, query, limit)
    typer.echo(json.dumps(result, indent=2, default=str))


@app.command("context")
def context_command(project: str, base_url: str = typer.Option("http://localhost:8000", envvar="RUNTRACE_BASE_URL")) -> None:
    result = client(base_url).request("GET", f"/api/v1/projects/{project}/context")
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
) -> None:
    command = list(ctx.args)
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise typer.BadParameter("Provide a command after --")
    rt = client(base_url)
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


if __name__ == "__main__":
    app()

