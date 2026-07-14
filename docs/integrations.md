# CLI, Python, Codex, and Claude Code

RunTrace clients connect to a deployed RunTrace API. Normal mode requires an agent token; create one in the web app under **Access → Your agent tokens**. Authenticate once for the CLI and MCP plugins:

```bash
runtrace auth "rt_..." --base-url "https://runtrace.example.com"
```

The unauthenticated local development stack has a stable client key so the same setup is reproducible:

```bash
runtrace auth rt_runtrace_dev --base-url http://localhost:8000
```

The command validates the token before saving it to `~/.config/runtrace/credentials.json` with user-only permissions. The MCP server rereads this file for each request, so an already-running Codex or Claude tool can use the new key immediately without exporting connection variables or restarting the host. `XDG_CONFIG_HOME` is respected.

To avoid placing the key in shell history, pass `-` and enter or pipe the key on standard input:

```bash
runtrace auth - --base-url "https://runtrace.example.com"
```

Environment variables are still supported and take precedence over the saved file:

```bash
export RUNTRACE_BASE_URL="https://runtrace.example.com"
export RUNTRACE_API_TOKEN="rt_..."
```

The token is displayed once by RunTrace and stored by the server only as a SHA-256 digest. Keep it in a secret manager and never in a repository.

## Standalone CLI

Install the lightweight CLI from PyPI without cloning the repository:

```bash
uv tool install runtrace-ai
runtrace --help
```

For an isolated one-off invocation:

```bash
uvx --from runtrace-ai \
  runtrace search PROJECT "prior evidence"
```

Tagged releases attach a wheel and source distribution to GitHub Releases. A manually approved PyPI Trusted Publishing workflow is included for use after the project is registered on PyPI.

## Python package

```bash
python -m pip install runtrace-ai
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
uv tool install runtrace-ai
codex plugin marketplace add vano04/RunTrace --ref master
codex plugin add runtrace@runtrace
runtrace auth rt_runtrace_dev --base-url http://localhost:8000
```

Or run `runtrace integrations install codex`, then run `runtrace auth`. The plugin launches MCP with `uvx`, so it needs no repository clone or persistent Python environment.

## Claude Code plugin

```bash
uv tool install runtrace-ai
claude plugin marketplace add vano04/RunTrace
claude plugin install runtrace@runtrace --scope user
runtrace auth rt_runtrace_dev --base-url http://localhost:8000
```

Or run `runtrace integrations install claude`, then run `runtrace auth`.

## Direct MCP fallback

Any stdio MCP host can run:

```bash
uvx --from 'runtrace-ai[mcp]==0.1.3' runtrace-mcp
```

The host needs `uv` plus either credentials saved by `runtrace auth` or the `RUNTRACE_BASE_URL` and `RUNTRACE_API_TOKEN` environment variables. Its first launch needs network access to GitHub and the Python package index.
