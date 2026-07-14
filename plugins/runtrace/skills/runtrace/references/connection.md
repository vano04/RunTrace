# Connection setup

The plugin starts the RunTrace MCP server over stdio with `uvx`. The host machine needs `uv` and outbound GitHub access for the first launch.

Set these variables before starting Codex or Claude Code:

```bash
export RUNTRACE_BASE_URL="https://runtrace.example.com"
export RUNTRACE_API_TOKEN="rt_..."
```

Create the token from **Access → Your agent tokens** in the RunTrace web app. The token is shown once. Store it in the host's secret manager and never commit it.

For a local development instance, `RUNTRACE_BASE_URL` defaults to `http://localhost:8000`. Normal production mode requires `RUNTRACE_API_TOKEN`; unauthenticated development mode must not be exposed to a network.
