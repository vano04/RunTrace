# CLI, Python, Codex, and Claude Code

RunTrace clients connect to a deployed RunTrace API. Normal mode requires an agent token; create one in the web app under **Access → Your agent tokens**. Export it in the shell that starts the client:

```bash
export RUNTRACE_BASE_URL="https://runtrace.example.com"
export RUNTRACE_API_TOKEN="rt_..."
```

The token is displayed once and stored by RunTrace only as a SHA-256 digest. Keep it in a secret manager, never in a repository or command history.

## Standalone CLI

Install the lightweight CLI from GitHub without cloning the repository:

```bash
uv tool install 'runtrace @ git+https://github.com/vano04/RunTrace.git@master'
runtrace --help
```

For an isolated one-off invocation:

```bash
uvx --from 'runtrace @ git+https://github.com/vano04/RunTrace.git@master' \
  runtrace search PROJECT "prior evidence"
```

Tagged releases attach a wheel and source distribution to GitHub Releases. A manually approved PyPI Trusted Publishing workflow is included for use after the project is registered on PyPI.

## Python package

```bash
python -m pip install 'runtrace @ git+https://github.com/vano04/RunTrace.git@master'
```

```python
import os
from runtrace import configure, run

configure(
    os.environ["RUNTRACE_BASE_URL"],
    api_token=os.environ["RUNTRACE_API_TOKEN"],
    strict=True,
)

with run("my-project", "Test the new scheduler") as tracked:
    tracked.log_metric("score", 0.91, step=100)
    tracked.finish("kept", "score improved", "Keep the scheduler")
```

## Codex plugin

```bash
codex plugin marketplace add vano04/RunTrace --ref master
codex plugin add runtrace@runtrace
```

Or run `runtrace integrations install codex`. Restart Codex after exporting the connection variables. The plugin launches MCP with `uvx`, so it needs no repository clone or persistent Python environment.

## Claude Code plugin

```bash
claude plugin marketplace add vano04/RunTrace
claude plugin install runtrace@runtrace --scope user
```

Or run `runtrace integrations install claude`, then restart Claude Code after exporting the connection variables.

## Direct MCP fallback

Any stdio MCP host can run:

```bash
uvx --from 'runtrace[mcp] @ git+https://github.com/vano04/RunTrace.git@master' runtrace-mcp
```

The host needs `uv`, `RUNTRACE_BASE_URL`, and `RUNTRACE_API_TOKEN`. Its first launch needs network access to GitHub and the Python package index.
