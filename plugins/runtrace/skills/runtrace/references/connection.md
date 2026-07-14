# Connection setup

The plugin starts the RunTrace MCP server over stdio with `uvx`. The host machine needs `uv` and outbound GitHub access for the first launch.

Create an agent token under **Access → Your agent tokens**, then save it for the CLI and MCP tool:

```bash
runtrace auth "rt_..." --base-url "https://runtrace.example.com"
```

The token is shown once. `runtrace auth - --base-url URL` reads it from standard input instead of putting it in shell history. Credentials are saved with user-only permissions and are reread by MCP on each request.

For ephemeral or secret-manager-provided credentials, environment variables take precedence:

```bash
export RUNTRACE_BASE_URL="https://runtrace.example.com"
export RUNTRACE_API_TOKEN="rt_..."
```

Never commit the token.

For a local development instance, the API URL defaults to `http://localhost:8000`. Normal production mode requires a saved or environment-provided token; unauthenticated development mode must not be exposed to a network.

The local development client key is `rt_runtrace_dev`. Save it with `runtrace auth rt_runtrace_dev --base-url http://localhost:8000`; the MCP server rereads the saved credential on each request, so Codex and Claude do not require shell exports.
