# RunTrace

RunTrace is a self-hosted experiment registry and persistent memory layer for autonomous research agents. It keeps hypotheses, code metadata, live metrics, artifacts, outcomes, and conclusions together so future runs can build on prior evidence.

The repository contains the maintained FastAPI service, Next.js application, Python SDK/CLI, and MCP server. A new installation starts empty unless the development seed is explicitly enabled.

## What it provides

- project-scoped experiment proposals and atomic worker claims;
- live run metrics and events over Server-Sent Events;
- parameters, Git metadata, logs, and downloadable artifacts;
- versioned `program.md` instructions and research exclusions;
- completed-run baselines and best-so-far progress charts;
- archive, restore, soft-delete, and audit history;
- keyword search, with optional pgvector semantic retrieval;
- browser password authentication for a self-hosted instance;
- revocable, expiring agent tokens for headless clients;
- HTTP, Python, CLI, and MCP interfaces.

## Architecture

| Component | Location | Technology |
| --- | --- | --- |
| API | `apps/api` | FastAPI, SQLAlchemy, Alembic |
| Web app | `apps/web` | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Python client and CLI | `packages/python_sdk` | HTTPX, Typer |
| MCP server | `apps/mcp` | Python MCP SDK |
| Database | Compose service | PostgreSQL 17 with pgvector |

## Quick start

Requirements: Docker with Compose support. From the repository root:

```bash
docker compose up --build
```

Open <http://localhost:3000>. On a fresh database, the first browser creates the instance owner and a password. Data is stored in named PostgreSQL and artifact volumes and survives `docker compose down`.

To deploy the published GitHub Container packages instead of building locally:

```bash
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

The images are `ghcr.io/vano04/runtrace:0.1.3` for the API/CLI/MCP runtime and `ghcr.io/vano04/runtrace-web:0.1.3` for the dashboard. Set `RUNTRACE_VERSION` to select another release.

Useful endpoints:

- web app: <http://localhost:3000>
- API health: <http://localhost:8000/health>
- OpenAPI UI: <http://localhost:8000/docs>

To run a local, unauthenticated instance populated with demonstration records:

```bash
RUNTRACE_DEV=true docker compose up --build
```

`RUNTRACE_DEV=true` disables authentication. Never enable it on a network-reachable deployment. Demo data is inserted only when the database has no projects.

Local clients use the known development key `rt_runtrace_dev`. The API remains unauthenticated in this mode, but using one stable client credential makes the CLI and agent plugins follow the same connection path as a normal deployment.

To deliberately erase the Compose volumes and recreate the demo:

```bash
./scripts/reset-demo.sh
```

This command is destructive. For ordinary shutdowns, use `docker compose down` without `-v`.

## Native development

Native API development requires Python 3.11 or newer and PostgreSQL with the `vector` extension. Copy `.env.example` to `.env`, review its values, and run:

```bash
UV_CACHE_DIR=.uv-cache uv sync --all-extras
UV_CACHE_DIR=.uv-cache uv run uvicorn runtrace_api.main:app --reload --port 8000
```

In a second terminal:

```bash
npm --prefix apps/web ci
npm --prefix apps/web run dev
```

Open <http://localhost:3000>. The server proxies `/api/*` to
`INTERNAL_API_URL`, which defaults to `http://localhost:8000`.

## Install the CLI and Python package

You do not need to clone the repository on an agent or application host. Install the lightweight CLI from PyPI:

```bash
uv tool install runtrace-ai
```

For Python applications:

```bash
python -m pip install runtrace-ai
```

In normal mode, create a token at **Access → Your agent tokens**, then authenticate the CLI and installed MCP plugin:

```bash
runtrace auth rt_... --base-url https://runtrace.example.com
```

For the local development stack, use its known key instead:

```bash
runtrace auth rt_runtrace_dev --base-url http://localhost:8000
```

This validates the key and saves it in a private user-level credential file. The MCP server rereads that file for every tool call, so Codex and Claude use the authenticated connection without shell exports or a host restart. `RUNTRACE_BASE_URL` and `RUNTRACE_API_TOKEN` remain supported and take precedence over saved credentials. The CLI can then retrieve context, search evidence, and track a command:

```bash
runtrace context <project-slug>
runtrace search <project-slug> "what has already been tried?"
runtrace exec --project <project-slug> --name "new variation" \
  --hypothesis "this should improve the primary metric" -- \
  python benchmark.py
```

Run the MCP server over stdio without a persistent install:

```bash
uvx --from 'runtrace-ai[mcp]==0.1.3' runtrace-mcp
```

## Codex and Claude Code plugins

```bash
# Codex app and CLI
codex plugin marketplace add vano04/RunTrace --ref master
codex plugin add runtrace@runtrace

# Claude Code
claude plugin marketplace add vano04/RunTrace
claude plugin install runtrace@runtrace --scope user
```

If the RunTrace CLI is already installed, `runtrace integrations install codex` or `runtrace integrations install claude` performs the same setup. Run `runtrace auth` once before or after installing the plugin; the plugin uses the saved connection automatically. See [the integration guide](docs/integrations.md) for direct MCP and Python examples.

## Configuration

`.env.example` documents native-development defaults. Important settings include:

| Variable | Purpose |
| --- | --- |
| `RUNTRACE_DATABASE_URL` | SQLAlchemy database connection URL |
| `RUNTRACE_BASE_URL` | API URL used by CLI, SDK, and MCP clients |
| `RUNTRACE_API_TOKEN` | Agent bearer token used by headless clients; overrides `runtrace auth` credentials |
| `RUNTRACE_ARTIFACT_PATH` | Local artifact storage directory |
| `RUNTRACE_CORS_ORIGINS` | Comma-separated browser origins |
| `RUNTRACE_DEV` | Disable auth for trusted local development only |
| `RUNTRACE_SEED_DEMO` | Seed an empty database with demo records |
| `RUNTRACE_EMBEDDINGS_ENABLED` | Enable FastEmbed semantic indexing |
| `RUNTRACE_SECURE_SESSION_COOKIE` | Mark browser cookies Secure when the public origin uses HTTPS |
| `RUNTRACE_OWNER_RECOVERY_PASSWORD` | One-start owner password recovery; remove immediately after use |
| `RUNTRACE_MAX_ARTIFACT_SIZE` | Maximum upload size in bytes |
| `RUNTRACE_CLAIM_TIMEOUT_SECONDS` | Age at which abandoned claims are requeued |

Compose disables embeddings by default to keep the base deployment lightweight. See [the deployment guide](docs/README.md), [authentication guide](docs/auth.md), and [integration guide](docs/integrations.md) before exposing an instance beyond localhost.

## Verification

```bash
UV_CACHE_DIR=.uv-cache uv sync --all-extras
UV_CACHE_DIR=.uv-cache uv run pytest
UV_CACHE_DIR=.uv-cache uv build
npm --prefix apps/web run lint
npm --prefix apps/web run build
docker compose config
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml config
RUNTRACE_DEV=true docker compose config
```

## Repository layout

```text
apps/api/            API service and database migrations
apps/mcp/            MCP stdio server
apps/web/            production web application
.agents/              Codex repository marketplace
.claude-plugin/       Claude Code repository marketplace
docs/                deployment and authentication documentation
examples/            small instrumentation examples
packages/python_sdk/ Python SDK and CLI
plugins/runtrace/     Codex and Claude Code plugin bundle
scripts/             maintenance and import helpers
tests/               API, migration, SDK, CLI, and MCP tests
```

Runtime databases, artifacts, caches, dependency directories, build output, and local environment files are intentionally excluded from version control and Docker build contexts.

## License

RunTrace is licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`). If you modify RunTrace and make it available to users over a network, you must offer those users the corresponding source code as required by the license.
