# Connection setup

The plugin starts `runtrace-mcp` through `uvx`; the host needs `uv` and first-launch package access.

Save a normal agent token without exposing it in shell history:

```bash
runtrace auth - --base-url "https://runtrace.example.com"
```

MCP rereads the user-only credential file on each request. `RUNTRACE_BASE_URL` and `RUNTRACE_API_TOKEN` override it. Never commit or log tokens.

For a trusted local no-auth stack, use:

```bash
runtrace auth rt_runtrace_dev --base-url http://localhost:8000
```

Keep development mode local. Call `list_projects` afterward to verify access and retrieve canonical slugs.
