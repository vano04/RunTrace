# Mono

Mono is a self-hosted experiment registry and persistent memory layer for autonomous research agents. It keeps hypotheses, code metadata, live metrics, artifacts, outcomes, and conclusions together so future runs can build on prior evidence.

The repository contains the maintained FastAPI service, Next.js application, Python SDK/CLI, and MCP server. A new installation starts empty unless the development seed is explicitly enabled.

## Table of contents

- [Product tour](#product-tour)
- [What it provides](#what-it-provides)
- [Architecture](#architecture)
- [How Codex was used](#how-codex-was-used)
- [Quick start](#quick-start)
- [Native development](#native-development)
- [Install the CLI and Python package](#install-the-cli-and-python-package)
- [Codex and Claude Code plugins](#codex-and-claude-code-plugins)
- [Configuration](#configuration)
- [Verification](#verification)
- [Repository layout](#repository-layout)
- [License](#license)

## Product tour

![Mono project dashboard showing best-so-far progress and the shared experiment queue](docs/images/gallery/mono-dashboard-progress.png)

The dashboard keeps the research objective, best-so-far progress, baseline, worker activity, and cooperative experiment queue in one shared view.

![Mono live experiment detail showing streamed metrics in a reusable custom visualization](docs/images/gallery/mono-live-metrics.png)

Every run preserves the hypothesis, reasoning, code metadata, live metrics, outcome, and artifacts as durable evidence.

![Mono evidence search across prior experiments, configurations, outcomes, and conclusions](docs/images/gallery/mono-evidence-search.png)

Agents and humans can retrieve what has already been tried before spending another run on the same idea.

![Mono CLI showing authentication, search, context, tracked execution, and agent integration commands](docs/images/gallery/mono-cli.png)

The CLI gives agents the same memory and experiment-tracking workflow without requiring a browser session.

![Mono built-in documentation for the dashboard, SDK, CLI, HTTP API, and MCP server](docs/images/gallery/mono-built-in-docs.png)

The built-in documentation connects the dashboard to the SDK, CLI, HTTP API, and MCP workflows agents use to produce those records.

## What it provides

- project-scoped experiment proposals and atomic worker claims;
- live run metrics and events over Server-Sent Events;
- parameters, Git metadata, logs, and downloadable artifacts;
- versioned `program.md` instructions and research exclusions;
- completed-run baselines and best-so-far progress charts;
- archive, restore, soft-delete, and internal mutation audit records;
- keyword search, with optional pgvector semantic retrieval;
- browser password authentication for a self-hosted instance;
- revocable, expiring agent tokens for headless clients;
- read-only viewer, project editor, and project owner roles with matching API and web controls;
- project-scoped, MCP-generated RTVis widgets with ShadCN theming, sandboxed JavaScript, and portable JSON import and export;
- HTTP, Python, CLI, and MCP interfaces.

The [complete feature catalog](docs/features.md) lists every current-source web, HTTP, SDK, CLI, MCP, visualization, authentication, and operational capability.

## Architecture

| Component | Location | Technology |
| --- | --- | --- |
| API | `apps/api` | FastAPI, SQLAlchemy, Alembic |
| Web app | `apps/web` | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Python client and CLI | `packages/python_sdk` | HTTPX, Typer |
| MCP server | `apps/mcp` | Python MCP SDK |
| Database | Compose service | PostgreSQL 17 with pgvector |

## How Codex was used

OpenAI Codex with GPT-5.6 was the primary AI engineering collaborator during Mono's development. The human developer supplied the product direction, constraints, acceptance criteria, and review; Codex helped turn those decisions into working code and repeatedly tested the result. This was an iterative engineering process rather than a one-shot code generation pass.

Codex worked across the full repository: it traced behavior through the FastAPI service, database models and migrations, Next.js interface, Python SDK and CLI, MCP server, Docker setup, release workflows, and documentation. It implemented and debugged cross-cutting features such as live metric streaming, run ownership and attachment, authentication and project authorization, custom visualizations, responsive layouts, localization, demo modes, and persistent user settings. Because a change in one interface often affects every other client, Codex was also used to keep HTTP, Python, CLI, MCP, UI, and documentation contracts aligned.

The most notable tools and integrations were:

| Codex capability | How it contributed |
| --- | --- |
| Coding and terminal tools | Inspected the repository, edited source and documentation, managed development services, and ran focused tests plus full Python, web, package, Compose, and release checks. |
| Browser | Exercised the live application with accessible-role interactions and DOM snapshots; changed viewport sizes; inspected console output and layout measurements; and captured before/after screenshots. This exposed issues that static review missed, including mobile record dialogs, fixed-width charts, horizontal overflow, and live-update behavior. |
| Computer Use | Controlled Chrome and macOS applications when page-level browser automation was not enough. It supported window-level visual QA, screen-capture experiments, and preparation of product-tour media. |
| Product Design plugin | Guided a responsive UX audit across desktop, mobile, and portrait-monitor layouts. Its recommendations were implemented and then verified in the browser, including full-screen mobile details, responsive charts, compact metadata, stable close controls, and removal of unintended page overflow. |
| GitHub plugin | Worked with `codex/` branches and pull requests, monitored GitHub Actions, and verified release assets. It was used for production hardening, the 0.1.4 release, and the 0.1.5 public-repository hygiene release across GitHub Releases, PyPI, and GHCR. |
| Mono plugin and MCP tools | Dogfooded Mono from Codex itself: retrieving project context, searching prior evidence, exercising experiment lifecycles, streaming metrics and events, and creating or validating project visualizations. That feedback loop helped refine both the product and its agent workflow. |

Codex also used separate focused tasks for agent-facing QA. Those tasks tested MCP memory retrieval, single-owner experiment lifecycles, CLI and SDK subprocess tracking, saved authentication, run attachment, failure closure, and visualization import/export against live instances. Synthetic fixtures were kept under `MonoDemo`, while reproducible regression coverage was added to the main test suites.

Generated changes were accepted only after evidence appropriate to their risk: unit and integration tests, lint and type checks, production builds, migration and Compose checks, browser interaction tests, visual inspection, or public artifact verification. Representative public milestones are [production hardening in PR #1](https://github.com/vano04/Mono/pull/1), [release 0.1.4 in PR #2](https://github.com/vano04/Mono/pull/2), and [the 0.1.5 repository-hygiene release in PR #3](https://github.com/vano04/Mono/pull/3).

## Quick start

Requirements: Docker with Compose support. From the repository root:

```bash
./scripts/install.sh
```

The install script builds the API and web images from the cloned source, starts PostgreSQL and the application services, and waits for their health checks. The equivalent Compose command is `docker compose up -d --build --wait`.

Open <http://localhost:3000>. On a fresh database, the first browser creates the instance owner and a password. Data is stored in named PostgreSQL and artifact volumes and survives `docker compose down`.

To update an existing checkout, fast-forward it to the latest revision and rebuild the running Compose services:

```bash
./scripts/update.sh
```

The update preserves the named database, artifact, and model volumes. It stops if Git cannot fast-forward or if Docker is unavailable.

To deploy the published GitHub Container packages instead of building locally:

```bash
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

The overlay defaults to `ghcr.io/vano04/mono:0.1.6` and `ghcr.io/vano04/mono-web:0.1.6`. Confirm that the selected tag exists in GitHub Packages or set `MONO_VERSION` to another published release.

Useful endpoints:

- web app: <http://localhost:3000>
- API health: <http://localhost:8000/health>
- OpenAPI UI: <http://localhost:8000/docs>

To run a local, unauthenticated instance populated with demonstration records:

```bash
MONO_DEV=true docker compose up --build
```

`MONO_DEV=true` disables authentication. Never enable it on a network-reachable deployment. Demo data is inserted only when the database has no projects.

To host the real Mono interface as a public, read-only demo, use demo mode instead:

```bash
MONO_DEMO=true docker compose up -d --build
```

`MONO_DEMO=true` seeds the same demonstration records into an empty database, signs visitors in as viewers, hides mutation controls in the web app, and rejects create, update, archive, upload, token, access, and delete requests in the API. Read-only search, artifact viewing, and live demo metrics remain available. Do not combine it with `MONO_DEV=true`.

Local clients use the known development key `rt_mono_dev`. The API remains unauthenticated in this mode, but using one stable client credential makes the CLI and agent plugins follow the same connection path as a normal deployment.

To deliberately erase the Compose volumes and recreate the demo:

```bash
./scripts/reset-demo.sh
```

This command is destructive. For ordinary shutdowns, use `docker compose down` without `-v`.

## Native development

Native API development requires Python 3.11 or newer and PostgreSQL with the `vector` extension. Copy `.env.example` to `.env`, review its values, and run:

```bash
UV_CACHE_DIR=.uv-cache uv sync --all-extras
UV_CACHE_DIR=.uv-cache uv run uvicorn mono_api.main:app --reload --port 8000
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
uv tool install mono-research
```

For Python applications:

```bash
python -m pip install mono-research
```

In normal mode, create a token at **Access → Your agent tokens**, then authenticate the CLI and installed MCP plugin:

```bash
mono auth rt_... --base-url https://mono.example.com
```

For the local development stack, use its known key instead:

```bash
mono auth rt_mono_dev --base-url http://localhost:8000
```

This validates the key and saves it in a private user-level credential file. The MCP server rereads that file for every tool call, so Codex and Claude use the authenticated connection without shell exports or a host restart. `MONO_BASE_URL` and `MONO_API_TOKEN` remain supported and take precedence over saved credentials. The CLI can then retrieve context, search evidence, and track a command:

```bash
mono context <project-slug>
mono search <project-slug> "what has already been tried?"
mono exec --project <project-slug> --name "new variation" \
  --hypothesis "this should improve the primary metric" -- \
  python benchmark.py
```

Agent loops should claim one proposal at a time. When `create_run` starts a pending proposal, pass the same cooperative `worker_id` returned on the claim; Mono rejects missing or mismatched claim identifiers.

Run the MCP server over stdio without a persistent install:

```bash
uvx --from 'mono-research[mcp]==0.1.6' mono-mcp
```

Public packages can lag this checkout. To exercise the exact current source during development, use `uv run --extra mcp mono-mcp`.

## Codex and Claude Code plugins

```bash
# Codex app and CLI
codex plugin marketplace add vano04/Mono --ref master
codex plugin add mono@mono

# Claude Code
claude plugin marketplace add vano04/Mono
claude plugin install mono@mono --scope user
```

If the Mono CLI is already installed, `mono integrations install codex` or `mono integrations install claude` performs the same setup. Run `mono auth` once before or after installing the plugin; the plugin uses the saved connection automatically. See [the integration guide](docs/integrations.md) for direct MCP and Python examples.

## Configuration

`.env.example` documents native-development defaults. Important settings include:

| Variable | Purpose |
| --- | --- |
| `MONO_DATABASE_URL` | SQLAlchemy database connection URL |
| `MONO_BASE_URL` | API URL used by CLI, SDK, and MCP clients |
| `MONO_API_TOKEN` | Agent bearer token used by headless clients; overrides `mono auth` credentials |
| `MONO_ARTIFACT_PATH` | Local artifact storage directory |
| `MONO_CORS_ORIGINS` | Comma-separated browser origins |
| `MONO_DEV` | Disable auth for trusted local development only |
| `MONO_DEMO` | Serve the seeded application as an unauthenticated, server-enforced read-only viewer |
| `MONO_SEED_DEMO` | Seed an empty database with demo records |
| `MONO_EMBEDDINGS_ENABLED` | Enable FastEmbed semantic indexing |
| `MONO_SECURE_SESSION_COOKIE` | Mark browser cookies Secure when the public origin uses HTTPS |
| `MONO_OWNER_RECOVERY_PASSWORD` | One-start owner password recovery; remove immediately after use |
| `MONO_MAX_ARTIFACT_SIZE` | Maximum upload size in bytes |
| `MONO_CLAIM_TIMEOUT_SECONDS` | Age at which abandoned claims are requeued |

Compose disables embeddings by default to keep the base deployment lightweight. See [the live metrics guide](docs/live-metrics.md), [deployment guide](docs/README.md), [authentication guide](docs/auth.md), and [integration guide](docs/integrations.md) before exposing an instance beyond localhost.

## Verification

```bash
UV_CACHE_DIR=.uv-cache uv sync --all-extras
UV_CACHE_DIR=.uv-cache uv run pytest
UV_CACHE_DIR=.uv-cache uv build
npm --prefix apps/web test
npm --prefix apps/web run lint
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
docker compose config
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml config
MONO_DEV=true docker compose config
MONO_DEMO=true docker compose config
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
plugins/mono/     Codex and Claude Code plugin bundle
MonoDemo/         reusable integration-test harnesses
scripts/             maintenance and import helpers
tests/               API, migration, SDK, CLI, and MCP tests
```

Runtime databases, artifacts, caches, dependency directories, build output, and local environment files are intentionally excluded from version control and Docker build contexts.

## License

Mono is licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`). If you modify Mono and make it available to users over a network, you must offer those users the corresponding source code as required by the license.
