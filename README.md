# RunTrace

RunTrace is a self-hosted experiment registry and persistent memory layer for autonomous research agents. It keeps hypotheses, prior evidence, code metadata, live metrics, outcomes, and conclusions together so a new agent can avoid repeating an old experiment.

This repository contains the MVP described in [`runtrace-implementation-spec.md`](./runtrace-implementation-spec.md) and preserves the accepted interface in [`prototype/`](./prototype/).

## What ships

- project-scoped FastAPI service with SQLite for native development and PostgreSQL in Docker
- durable projects, versioned `program.md`, exclusions, proposals, claims, runs, metrics, events, parameters, artifacts, baselines, workers, and audit events
- atomic compare-and-update claim behavior
- project context and evidence search endpoints
- live run updates over Server-Sent Events
- project progress settings that use exact emitted metric names and render strict best-so-far step charts
- Python SDK and `runtrace exec` CLI wrapper
- MCP tools for context, search, proposing/claiming work, run creation, metric/event logging, and completion
- seeded Dense Optimizer demo and the approved responsive React dashboard

## Quick start (native)

```bash
UV_CACHE_DIR=.uv-cache uv sync --extra dev
uv run uvicorn runtrace_api.main:app --reload --port 8000
```

In another terminal:

```bash
cd prototype
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to the API.

## Quick start (Docker)

Start Docker Desktop, then run:

```bash
docker-compose up --build
```

Open `http://localhost:3000`. API documentation is at `http://localhost:8000/docs`. If your Docker installation exposes Compose as a CLI plugin, `docker compose up --build` is equivalent.

Reset the seeded demo (this intentionally clears the local demo database):

```bash
./scripts/reset-demo.sh
```

## Agent closed loop

```bash
runtrace context dense-optimizer
runtrace search dense-optimizer "power iteration runtime"
runtrace exec --project dense-optimizer --name two-step-test \
  --hypothesis "Two steps preserve quality with less runtime" -- \
  python examples/metric_demo.py
```

The MCP server uses stdio and reads `RUNTRACE_BASE_URL`:

```bash
RUNTRACE_BASE_URL=http://localhost:8000 runtrace-mcp
```

## Tests

```bash
UV_CACHE_DIR=.uv-cache uv run pytest
npm --prefix prototype run build
```

The API remains useful without OpenAI credentials or embeddings; keyword evidence retrieval is the default MVP path.
