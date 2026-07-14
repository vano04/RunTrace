# RunTrace development and preview behavior

This document is a handoff for future Codex tasks and maintainers. It records the intended deployment modes, database lifecycle, seeded preview contract, and experiment-detail behavior introduced in the current implementation.

## Deployment modes

### Normal Compose

```bash
docker compose up --build
```

Normal Compose is the self-hosted application path:

- The API connects to the `postgres` service through `RUNTRACE_DATABASE_URL`.
- PostgreSQL stores its data in the named `runtrace-postgres` volume.
- A new, empty volume produces the first-project setup screen; demo records are not inserted.
- Stopping and restarting Compose preserves projects, runs, metrics, and other registry data.
- `docker compose down` preserves named volumes.
- `docker compose down -v` permanently removes the database and artifact volumes.

The repository-local `data/runtrace.db` SQLite file is not used by Compose. Native development and tests may still use SQLite when configured to do so.

### Seeded development preview

```bash
RUNTRACE_DEV=true docker compose up --build
```

The `RUNTRACE_DEV` flag makes Compose pass both `RUNTRACE_DEV=true` and `RUNTRACE_SEED_DEMO=true` to the API. The API inserts the demo projects and experiment evidence only when the database contains no projects. It never overwrites or mixes demo data into an existing registry.

To deliberately recreate the preview from an empty Compose database:

```bash
./scripts/reset-demo.sh
```

`reset-demo.sh` runs `docker compose down -v`, so it is destructive to all Compose-managed RunTrace data.

Normal mode requires passkey authentication. On a new database, the first browser creates the owner identity and saves its first passkey. The owner and admins can create name-only identities, choose an Admin or Member role, and share a one-time setup link. `RUNTRACE_DEV=true` deliberately bypasses authentication for the local seeded preview and must never be enabled on a reachable deployment.

Passkeys bind to the deployment hostname. Set `RUNTRACE_WEBAUTHN_RP_ID` to that hostname and `RUNTRACE_WEBAUTHN_ORIGINS` to the exact public HTTPS origin before onboarding the owner. See [`auth.md`](auth.md) for the full contract.

## Experiment-detail interaction contract

Experiment evidence opens in a centered, wide modal rather than a side sheet. The shared modal is used by:

- recent completed experiments on the dashboard;
- current baseline links;
- active runs and proposed experiments in the shared queue;
- run and experiment results on the Search page;
- archived runs and experiments.

Run records include the curve, metric summaries, conclusion, configuration, logs, events, artifacts, and Git metadata. Proposal records include their hypothesis, reasoning, implementation details, source, metric mode, and configuration.

Implementation details may contain a fenced `diff` block. The web app renders these as a source diff with added and removed lines, while preserving the raw text for API, SDK, search, and MCP consumers.

The relevant frontend files are:

- `apps/web/src/components/record-detail-dialog.tsx` — shared run/experiment modal;
- `apps/web/src/components/project-workspace.tsx` — selection state and entry-point click handling;
- `apps/web/src/components/run-curve-chart.tsx` — run/baseline curve rendering.

## Seeded metric-data contract

Completed demo curves in `apps/api/runtrace_api/seed.py` must:

- begin at step `0`;
- end at step `1000`;
- record adjacent points 100–200 steps apart;
- retain the documented final values used by progress and search tests.

The current completed demo curves use 125-step intervals and contain nine points. `RunCurveChart` renders a marker for every selected-run and baseline point, not just each series' final point.

`RUN-174` is the dev-only live demonstration run. While `RUNTRACE_SEED_DEMO=true`, the API appends one `validation_loss` point every 10 seconds at steps 0, 100, …, 1000, then starts the curve again. The run detail dialog subscribes to its SSE stream and refreshes the selected curve against `RUN-168` without closing the dialog.

The demo also includes two pending proposals claimed by `autoresearch/Jul4` and `autoresearch/Jul5`. Workers should call the release endpoint when they stop before creating a run. As a failure fallback, pending claims older than `RUNTRACE_CLAIM_TIMEOUT_SECONDS` (300 seconds by default) are returned to `proposed` the next time the project queue, dashboard, context, or claim endpoint is read.

## Destructive project operations

Project Settings includes a permanent delete action with a confirmation dialog. Deleting a project cascades through proposals, runs, metrics, events, parameters, tag definitions, versions, search documents, and audits, and removes the project's artifact directories. This differs from record archive and soft-delete actions and cannot be undone.

Keep `test_demo_curves_cover_step_range_at_readable_intervals` in `tests/test_api.py` aligned with this contract when changing the seed data.

## Implementation map

- `docker-compose.yml` — persistent PostgreSQL connection and `RUNTRACE_DEV` mapping.
- `apps/api/runtrace_api/main.py` — migrations/startup and conditional seed call.
- `apps/api/runtrace_api/seed.py` — idempotent preview records and metric points.
- `scripts/reset-demo.sh` — destructive clean-preview reset.
- `apps/web/src/components/record-detail-dialog.tsx` — detailed modal UI.
- `apps/web/src/components/run-curve-chart.tsx` — full point plotting.
- `apps/web/src/components/project-workspace.tsx` — dashboard/search/archive modal entry points.
- `apps/web/src/app/docs/page.tsx` — complete in-app quick start and SDK/CLI/MCP/HTTP reference.
- `apps/api/runtrace_api/config.py` — abandoned-claim timeout setting.

## Verification

Run these checks after changing either behavior:

```bash
UV_CACHE_DIR=.uv-cache uv run pytest -q
npm --prefix apps/web run lint
npm --prefix apps/web run build
docker compose config
RUNTRACE_DEV=true docker compose config
```

For rendered QA, verify both paths:

1. Open a completed run from **Recent completed experiments** and confirm the wide modal fits the entire curve and every point has a marker.
2. Open both a run and a proposal from **Search** and confirm each displays the appropriate detailed modal.

Do not erase an existing Compose volume merely to test seeding. Use an isolated Compose project/volume or obtain explicit approval before running a destructive reset.
