# CLI, Python, Codex, and Claude Code

Mono clients connect to a deployed Mono API. Normal mode requires an agent token; create one in the web app under **Access → Your agent tokens**. Authenticate once for the CLI and MCP plugins:

For complete create, log, watch, and finish examples for every client, see the [live metrics guide](live-metrics.md).

```bash
mono auth "rt_..." --base-url "https://mono.example.com"
```

The unauthenticated local development stack has a stable client key so the same setup is reproducible:

```bash
mono auth rt_mono_dev --base-url http://localhost:8000
```

The command validates the token before saving it to `~/.config/mono/credentials.json` with user-only permissions. The MCP server rereads this file for each request, so an already-running Codex or Claude tool can use the new key immediately without exporting connection variables or restarting the host. `XDG_CONFIG_HOME` is respected.

To avoid placing the key in shell history, pass `-` and enter or pipe the key on standard input:

```bash
mono auth - --base-url "https://mono.example.com"
```

Environment variables are still supported and take precedence over the saved file:

```bash
export MONO_BASE_URL="https://mono.example.com"
export MONO_API_TOKEN="rt_..."
```

The token is displayed once by Mono and stored by the server only as a SHA-256 digest. Keep it in a secret manager and never in a repository.

## Standalone CLI

Install the lightweight CLI from PyPI without cloning the repository:

```bash
uv tool install mono-research
mono --help
```

For an isolated one-off invocation:

```bash
uvx --from mono-research \
  mono search PROJECT "prior evidence"
```

Tagged releases attach a wheel and source distribution to GitHub Releases and publish the same version through PyPI Trusted Publishing. The PyPI workflow also supports validated exact-tag manual recovery.

## Python package

```bash
python -m pip install mono-research
```

```python
import os
from mono import configure, run

configure(
    os.environ["MONO_BASE_URL"],
    api_token=os.environ["MONO_API_TOKEN"],
    strict=True,
)

with run("my-project", "Test the new scheduler") as tracked:
    tracked.log_metric("score", 0.91, step=100)
    tracked.finish("kept", "score improved", "Keep the scheduler")
```

### One execution, one run

Choose one component to create the run. If an agent creates it through MCP but the child process already uses the Python SDK, pass the returned ID to the process:

```bash
MONO_RUN_ID=run_... python train.py
```

The SDK attaches to that running record and refuses inaccessible, closed, or cross-project IDs. Do not create one run through MCP and a second through the SDK or `mono exec` for the same process.

## Codex plugin

```bash
uv tool install mono-research
codex plugin marketplace add vano04/Mono --ref master
codex plugin add mono@mono
mono auth rt_mono_dev --base-url http://localhost:8000
```

Or run `mono integrations install codex`, then run `mono auth`. The plugin launches MCP with `uvx`, so it needs no repository clone or persistent Python environment.

### Generate project visualizations

The plugin can author trusted, project-scoped RTVis widgets. Ask Codex:

> Generate a visualization for this data and save it to the `my-project` Mono dashboard.

Codex first calls `get_visualization_guide` to retrieve the exact schema supported by the connected server, then supplies a versioned JSON specification to `generate_visualization`. Mono prefers ShadCN-backed layout and data components plus theme-aware SVG chart marks. For interactions those nodes cannot express, RTVis also supports a portable JavaScript widget with separate markup, styles, script, data, and dimensions. Custom code runs in an isolated iframe with no same-origin or network access and receives the active Mono theme through `window.mono`.

Saved visualizations are managed per project in Settings. Use **New** to configure one manually, or use a visualization's three-dot menu to edit, export, show or hide, and delete it. Exported `.rtvis.json` documents can be imported into another project.

Use `export_visualization` to retrieve a versioned `mono-visualization` JSON document and `import_visualization` to install that document in another project. Inline datasets travel with the export; `mono` datasets resolve against records in the destination project.

## Claude Code plugin

```bash
uv tool install mono-research
claude plugin marketplace add vano04/Mono
claude plugin install mono@mono --scope user
mono auth rt_mono_dev --base-url http://localhost:8000
```

Or run `mono integrations install claude`, then run `mono auth`.

## Direct MCP fallback

Any stdio MCP host can run:

```bash
uvx --from 'mono-research[mcp]==0.1.6' mono-mcp
```

The host needs `uv` plus either credentials saved by `mono auth` or the `MONO_BASE_URL` and `MONO_API_TOKEN` environment variables. Its first launch needs network access to GitHub and the Python package index.
