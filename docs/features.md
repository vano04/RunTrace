# Mono feature catalog

This catalog describes the current repository source (package metadata `0.1.6`) and distinguishes public product behavior from internal records and migration-only compatibility tables.

## Product surfaces

| Surface | What it provides |
| --- | --- |
| Web application | Password-protected project registry, dashboards, evidence search, archive, project configuration, access administration, account preferences, documentation, and RTVis management. |
| HTTP API | Project, experiment, run, evidence, search, visualization, authentication, access-control, and live-stream endpoints under `/api/v1`. |
| Python SDK | Context-managed tracking, existing-run attachment, metrics, parameters, events, artifacts, metadata capture, buffered transient writes, and search. |
| CLI | Authentication, context and evidence lookup, tracked subprocess execution, structured stdout parsing, and Codex/Claude plugin installation. |
| MCP server | 32 tools for agent orientation, evidence retrieval, experiment loops, run tracking, tags, baselines, and visualizations. |
| Deployment | Native Python/Node development, source-build Compose, published-image Compose, PostgreSQL/pgvector, persistent artifacts, migrations, health checks, and demo seeding. |

## Web application

All web routes share the authentication gate. A normal instance requires an owner bootstrap or password login; trusted `MONO_DEV=true` instances bypass authentication.

### Routes

| Route | Features |
| --- | --- |
| `/` | Project registry, aggregate counts, project search, responsive cards, create-project dialog, onboarding, docs/account/access navigation, visibility-aware two-second refresh. |
| `/docs` | Quick start, concepts, live metrics, Python, CLI, MCP, Codex/Claude, HTTP/SSE, lifecycle documentation, desktop section navigation, and proxied Swagger link. |
| `/account` | Light/dark/system theme, accent color and dynamic favicon, compact rows, appearance reset, 11 locales, and password change. |
| `/access` | Identity search and filters, identity creation, one-time setup links, role/status changes, suspension/reactivation, token creation, project scopes, expiry, one-time secret display, and token revocation. |
| `/projects/[slug]` | Project dashboard, progress controls, baseline, recorded-worker count, shared-registry badge, queue, completed history, custom widgets, record details, live runs, and record actions. |
| `/projects/[slug]/search` | Browse/search evidence, hybrid/keyword/semantic results, include/exclude tag filters, metric/relevance/time ordering, record details, and actions. |
| `/projects/[slug]/archive` | Archived experiment/run list with details, edit, restore, and soft-delete actions. |
| `/projects/[slug]/settings` | Editors/owners: goal/repository metadata, versioned `program.md`, exclusions, primary metric and direction, tag registry, MCP bootstrap call, and RTVis management. Owners/admins additionally manage membership and project deletion; viewers receive a read-only explanation. |

### Authentication and onboarding

- Atomic first-owner bootstrap with a username and a password of at least 12 characters.
- Normal password login, invalid-login feedback, logout, and password changes.
- One-time, expiring setup links for invited identities.
- Full-screen authentication loading, bootstrap, login, and invited-user setup states.
- Five-step onboarding: welcome, project creation, program, measurement/exclusions, and ready state.
- Onboarding can be skipped and is persisted per identity.
- Development-mode bypass is visibly identified.

### Project registry and navigation

- Project cards show active-run and experiment-record counts; the page header aggregates project count, active runs, and experiment records.
- The project-list API additionally returns each project's recorded-worker count.
- Client-side project filtering and no-match/empty/loading/error states.
- New projects accept a name, generated/editable slug, durable goal, and optional repository URL.
- Desktop project sidebar and mobile/tablet navigation sheet.
- Refresh pauses while the page is hidden and resumes on focus or visibility return.

### Dashboard and research workflow

- Best-so-far progress chart for the configured metric and direction.
- Time windows from 24 hours through all history.
- Three-state tag filters: neutral, include, and exclude.
- Current baseline card and baseline metric value.
- Recorded worker count and a static shared-registry badge.
- Proposed, pending, and running experiment queue.
- Completed and crashed run history.
- Responsive card layouts on small screens and richer tables on larger screens.
- Editors and owners create/edit experiments with title, hypothesis, reasoning, implementation details, and result-display type; source/model metadata is read-only in details.
- Every project role can open experiment/run details. Editors and owners additionally archive/restore, soft-delete, upload artifacts, and set baselines.

### Record details and live updates

- Experiment details: lifecycle, source/model, claim owner, result mode, hypothesis/reasoning, implementation plan/diff, and configuration.
- Run details: lifecycle, disposition, conclusion-or-result summary, command, Git branch/commit, configuration, metrics, events, parameters, and artifacts.
- SSE updates for metrics, events, and terminal status while a run is active.
- Resume cursors prevent replaying already-seen metric and event IDs.
- Polling fallback and full refresh after stream errors or terminal transitions.
- Run curve compared with the current baseline, with keyboard and pointer-accessible points.
- Built-in scalar, timing, bar, curve, or no-result presentations plus registered custom result displays.

### Search and archive

- Empty-query evidence browsing and text queries across experiment/run evidence.
- Keyword, optional semantic, and hybrid relevance signals.
- Include/exclude tag filters.
- Newest, oldest, lowest metric, highest metric, and relevance ordering.
- Active search excludes archived records by default.
- Archived records remain viewable, restorable, editable where applicable, and soft-deletable.

### Artifacts

- The web uploader offers `artifact`, `log`, and `config`; the HTTP/SDK surfaces also accept `result`, `checkpoint`, or custom kind metadata.
- Direct download for every stored artifact.
- Inline preview for text, JSON, YAML, XML, config, log, and similar formats.
- Preview responses truncate at 500 KB; the web suppresses unsupported binary previews and the API returns an explicit error if requested directly.
- Dedicated configuration and log sections in run details.

### Appearance, localization, and responsive behavior

- Light, dark, and system theme modes.
- Validated hexadecimal accent color, generated favicon, and browser-local persistence.
- Compact table-row preference and reset-to-default action.
- Identity-persisted locale with English, Simplified Chinese, Traditional Chinese, Spanish, Brazilian Portuguese, French, German, Japanese, Korean, Russian, and Hindi catalogs.
- Auth, onboarding, registry, shell, dashboard, charts, dialogs, settings, and navigation adapt across phone, tablet, desktop, and wide layouts.

## Authentication and authorization

- Password hashes use salted scrypt; unknown-user logins still perform a dummy password hash.
- Login throttling limits a username/IP pair to 10 failures in five minutes.
- Browser sessions are opaque, hashed at rest, `HttpOnly`, `SameSite=Lax`, optionally `Secure`, and expire after a configurable TTL.
- Instance roles are `owner`, `admin`, and `member`.
- Project roles are `owner`, `editor`, and `viewer`.
- The dashboard returns the effective `access_role`; the web app derives viewer/editor/owner capabilities from it and hides mutation controls that the API would reject.
- The last project owner cannot be removed or demoted.
- The instance owner cannot be suspended or demoted.
- Suspending an identity revokes its sessions and API tokens.
- In normal mode, agent tokens are shown once, hashed at rest, optionally expire in 1–365 days, record prefix/last use, and carry fixed project grants. Development mode rejects token creation because it has no persisted identity.
- Project grants constrain list, direct project/run/artifact access, global search, membership administration, and project creation.
- Browser-session members manage their own tokens; browser-session administrators can manage instance identities and tokens.
- Bearer tokens cannot mint, list, or revoke credentials; administer identities; change passwords or preferences; or complete browser onboarding.
- `MONO_OWNER_RECOVERY_PASSWORD` applies owner recovery at startup and revokes existing sessions; remove the variable after the recovery start.

Access matrix:

| Principal | Effective access |
| --- | --- |
| Project viewer | Read assigned project records and evidence. |
| Project editor | Viewer access plus project research, evidence, settings, tags, and visualization mutations. |
| Project owner | Editor access plus project membership administration and project deletion. |
| Instance owner/admin | Access every project and administer instance identities and tokens from a browser session. |
| Project-scoped bearer token | Acts as its owning identity only inside its immutable project grants; it cannot perform browser-account administration or create projects. |

Authentication endpoints:

| Method and path | Capability |
| --- | --- |
| `GET /api/v1/auth/status` | Configuration/authentication state and current identity. |
| `POST /api/v1/auth/bootstrap` | Create the first owner. |
| `POST /api/v1/auth/setup` | Consume an invited-user setup token. |
| `POST /api/v1/auth/login` | Password login. |
| `POST /api/v1/auth/logout` | Revoke the current browser session. |
| `POST /api/v1/auth/password` | Change or establish the current identity password. |
| `PATCH /api/v1/auth/preferences` | Persist locale preferences. |
| `POST /api/v1/auth/onboarding/complete` | Mark onboarding complete. |
| `GET, POST /api/v1/auth/tokens` | List and create agent tokens. |
| `DELETE /api/v1/auth/tokens/{token_id}` | Revoke a token. |
| `GET, POST /api/v1/auth/identities` | List and create identities. |
| `PATCH /api/v1/auth/identities/{identity_id}` | Change role or status. |
| `POST /api/v1/auth/identities/{identity_id}/setup-link` | Refresh a one-time setup link. |
| `GET, POST /api/v1/auth/projects/{project}/members` | List and add project members. |
| `PATCH, DELETE /api/v1/auth/projects/{project}/members/{identity_id}` | Change or remove project membership. |

## Project and experiment model

### Projects and durable context

- Project create/list/read/update/delete with case-insensitive slug lookup.
- Human-readable `EXP-NNN` and `RUN-NNN` display IDs are allocated per project; canonical IDs are globally unique, and ambiguous cross-project run shorthand returns 409 rather than guessing.
- Description and repository URL.
- Versioned `program.md` content.
- Versioned exclusion rules.
- Configurable primary metric name and `lower_is_better`/`higher_is_better` direction.
- Available metric discovery from recorded points.
- Project-scoped baseline.
- Context response containing project, program, exclusions, baseline, metric settings, claimable proposals, recent terminal evidence, context version, and operation URLs.
- Dashboard response aggregating effective access role, queue, active/completed/crashed/archived records, instructions, tags, visualizations, result types, and counts.

Project/context endpoints:

| Method and path | Capability |
| --- | --- |
| `POST, GET /api/v1/projects` | Create or list accessible projects. |
| `GET, PATCH, DELETE /api/v1/projects/{project}` | Read, update, or delete a project. |
| `GET, PUT /api/v1/projects/{project}/settings` | Read or update primary metric settings. |
| `GET, PUT /api/v1/projects/{project}/program` | Read or append a program version. |
| `GET, PUT /api/v1/projects/{project}/exclusions` | Read or append an exclusion version. |
| `GET /api/v1/projects/{project}/context` | Retrieve the agent bootstrap snapshot. |
| `GET /api/v1/projects/{project}/dashboard` | Retrieve the web dashboard aggregate. |
| `GET /api/v1/projects/{project}/progress` | Retrieve filtered best-so-far progress. |
| `POST /api/v1/projects/{project}/baseline` | Select a completed run in this project. |

### Experiments and claims

- Proposal fields: title, hypothesis, reasoning, implementation details, configuration, source, source model, dependency IDs, priority, and result-display key.
- Lifecycle: claimed work follows `proposed → pending → running → completed|crashed`; proposals may start directly, and release/expiry moves `pending → proposed`.
- Disposition: `undecided`, `kept`, or `discarded`.
- Atomic claim-next and claim-specific operations.
- Release/start requires the same cooperative `worker_id` recorded by the claim; this identifier coordinates workers and is not an authentication credential.
- Expired claims are requeued after the configured timeout when experiment list/claim, context, or dashboard next evaluates them.
- Archive/restore and soft-delete keep evidence separate from active work.

Experiment endpoints:

| Method and path | Capability |
| --- | --- |
| `GET, POST /api/v1/projects/{project}/experiments` | List or propose experiments. |
| `GET, PATCH, DELETE /api/v1/projects/{project}/experiments/{identifier}` | Read, update, or soft-delete an experiment. |
| `POST /api/v1/projects/{project}/experiments/claim` | Atomically claim the next proposal. |
| `POST /api/v1/projects/{project}/experiments/{identifier}/claim` | Claim a specific proposal. |
| `POST /api/v1/projects/{project}/experiments/{identifier}/release` | Release an owned pending claim. |
| `POST /api/v1/projects/{project}/experiments/{identifier}/archive` | Archive an experiment. |
| `POST /api/v1/projects/{project}/experiments/{identifier}/restore` | Restore an experiment. |

## Runs and evidence

- Standalone run creation or creation from an unclaimed/owned experiment.
- Claimed runs require the same `worker_id`; result mode is inherited unless explicitly overridden.
- Hypothesis, reasoning, change summary, cited evidence, decision change, command, working directory, Git state, configuration, host/environment metadata, and parent/source links.
- Metric batches of 1–1,000 numeric points with name, value, step, timestamp, and JSON context.
- Metrics accept a per-run `X-Request-ID` for idempotent retry handling and only accept writes while running.
- Parameter batches upsert values by name.
- Structured events include level, type, metadata, timestamp, and per-run request-ID retry deduplication.
- Finish records disposition, result summary, conclusion, and terminal time.
- Crash records an error summary without allowing a terminal run to be rewritten.
- Finish/crash accept per-run `X-Request-ID` replay semantics.
- Archive/restore, soft-delete, and completed-run baseline selection. Running runs and visualization source runs cannot be deleted; deleting the current terminal baseline clears the project's baseline reference.
- SSE stream emits metric, event, and status frames and accepts resume cursors. The production web proxy uses a dedicated unbuffered, no-transform route so small frames arrive immediately.

Run/evidence endpoints:

| Method and path | Capability |
| --- | --- |
| `POST, GET /api/v1/projects/{project}/runs` | Create or list runs. |
| `GET, DELETE /api/v1/runs/{identifier}` | Read or soft-delete a run. |
| `POST /api/v1/runs/{identifier}/archive` | Archive a run. |
| `POST /api/v1/runs/{identifier}/restore` | Restore a run. |
| `POST /api/v1/runs/{identifier}/metrics` | Append an idempotent metric batch. |
| `POST /api/v1/runs/{identifier}/events` | Append a structured event. |
| `POST /api/v1/runs/{identifier}/parameters` | Upsert parameters. |
| `POST /api/v1/runs/{identifier}/finish` | Complete a running run. |
| `POST /api/v1/runs/{identifier}/crash` | Crash a running run. |
| `GET /api/v1/runs/{identifier}/stream` | Stream live evidence and status over SSE. |
| `POST /api/v1/runs/{identifier}/artifacts` | Upload an artifact. |
| `GET /api/v1/artifacts/{artifact_id}/download` | Download an artifact. |
| `GET /api/v1/artifacts/{artifact_id}/preview` | Preview a supported text-like artifact. |

## Search, tags, progress, and baselines

- Search covers experiment titles/hypotheses/reasoning/plans/configuration and run hypotheses/reasoning/results/conclusions/decisions/configuration/evidence/parameters/events/artifact metadata/tags.
- Keyword search is always available.
- Optional FastEmbed plus pgvector adds semantic similarity and hybrid ranking.
- Lifecycle, archive, include-tag, and exclude-tag filters cover experiments and runs; disposition filtering applies to runs.
- Tag registry names are case-insensitively unique.
- Tags auto-register from experiment/run configuration and `tags` parameters.
- Renaming or deleting a tag rewrites explicit uses.
- Built-in rule-backed tags identify imported autoresearch `early stop` and `long run` records.
- Progress selects completed runs containing the requested metric, infers final steps, computes percentage and best-so-far values, and supports time/tag windows.

Endpoints:

| Method and path | Capability |
| --- | --- |
| `POST /api/v1/search` | SDK/MCP global-form project search. |
| `GET /api/v1/projects/{project}/search` | Query-parameter project search for the web app. |
| `GET, POST /api/v1/projects/{project}/tags` | List or create tags. |
| `PATCH, DELETE /api/v1/projects/{project}/tags/{tag_id}` | Rename or delete a tag. |

## RTVis visualizations

### Project dashboard widgets

- Versioned RTVis v1 specifications.
- Preview without saving, with optional source-run context for `run_metrics` datasets.
- Create/list/get/update/delete.
- Visibility and sort order.
- Revision tracking.
- Portable `mono-visualization` JSON export/import; source-bound `run_metrics` exports freeze their resolved rows into an inline dataset so the document can cross projects without a run-ID dependency.
- Inline datasets, live project datasets for runs/experiments, and source-run-bound `run_metrics` datasets.
- Lifecycle, disposition, tag, and limit filters for live datasets.

### Run result displays

- Built-ins: `curve`, `timings`, `scalar`, `bar`, and `none`.
- Reusable custom result types backed by the current run's `run_metrics` dataset.
- Metric fields include name, value, step, timestamp, and metric context.
- Latest-per-name, sort, order, and limit transformations.
- In-use custom types cannot be deleted.

### Nodes and sandbox

- Trusted nodes: stack, grid, card, metric, table, chart, badge, text, and separator.
- Charts: line, area, bar, scatter, and heatmap.
- Nested-field lookup and aggregation.
- JavaScript widgets receive resolved datasets and active theme tokens.
- JavaScript runs in an `allow-scripts` iframe without same-origin access.
- CSP blocks network connections, remote fonts, frames, and non-data images.
- Server validation rejects unsafe markup script tags and stylesheet imports.
- Limits include 1 MB documents, 5,000 inline rows, 10 nesting levels, and 100 rendered table rows.

Visualization endpoints:

| Method and path | Capability |
| --- | --- |
| `GET /api/v1/projects/{project}/visualizations/guide` | Dashboard RTVis schema and existing-widget guide. |
| `POST /api/v1/projects/{project}/visualizations/preview[?source_run_id=…]` | Validate/resolve without saving, optionally against one project run. |
| `GET, POST /api/v1/projects/{project}/visualizations` | List or create widgets. |
| `GET, PATCH, DELETE /api/v1/projects/{project}/visualizations/{id}` | Read, update, or delete a widget. |
| `GET /api/v1/projects/{project}/visualizations/{id}/export` | Export a portable document. |
| `POST /api/v1/projects/{project}/visualizations/import` | Import a portable document. |
| `GET /api/v1/projects/{project}/result-visualizations/guide` | Run-result schema and registered-type guide. |
| `GET, POST /api/v1/projects/{project}/result-visualizations` | List or create reusable result types. |
| `DELETE /api/v1/projects/{project}/result-visualizations/{key}` | Delete an unused custom result type. |

## Python SDK

The `mono-research` Python package supports:

- Explicit base URL and token, `api_key` compatibility alias, and strict or best-effort behavior.
- Project search plus a project-creation helper for development mode; fixed-grant production bearer tokens cannot create projects.
- Module-level `configure`, `run`, `search`, and `create_project` convenience helpers.
- Context-managed run lifecycle.
- Attachment to an existing accessible, running, same-project run with `run_id` or `MONO_RUN_ID`.
- Automatic command, working directory, Git branch/commit/dirty state, hostname, platform, Python, executable, arguments, CPU, and memory metadata.
- Single/batched metrics and parameters.
- Structured events, reasoning events, tags, and run-relationship events.
- Arbitrary file artifacts, text/log artifacts, and JSON configuration artifacts.
- Explicit finish/abort plus automatic undecided completion or crash on context-manager exit.
- A 2,000-item in-memory transient-write buffer with stable request IDs and explicit/`atexit` flush; a full queue raises instead of evicting older evidence.
- For buffer-enabled evidence and terminal writes, transport failures queue the request. Strict HTTP-status rejections raise without adding a new item; best-effort mode queues server failures but warns and discards permanent client rejections.
- Strict explicit flush raises while retaining the failed item; shutdown flush catches and reports failures. Terminal updates queue behind pending evidence so recovery preserves evidence-before-finish ordering, and a manually terminal run is not aborted again on context exit.

## CLI and credentials

Commands:

- `mono --version`
- `mono auth TOKEN [--base-url URL]`; `TOKEN=-` reads one line from stdin.
- `mono context PROJECT`
- `mono search PROJECT QUERY [--limit N]`
- `mono exec --project PROJECT --name NAME --hypothesis TEXT [--reasoning TEXT] [--base-url URL] -- COMMAND...`
- `mono integrations install codex|claude [--ref REF] [--dry-run]`

`mono exec` merges and forwards child stdout/stderr, parses flushed `MONO_METRIC` and `MONO_EVENT` lines, finishes on exit zero, crashes on nonzero exit, and returns the child's exit code.

Connection precedence is explicit arguments, environment, saved credentials, then the known local-development connection. A saved token is reused only when its saved base URL matches the resolved origin. Credentials use an XDG-aware user path, directory mode `0700`, file mode `0600`, and atomic replacement. `MONO_API_TOKEN` and `MONO_API_KEY` are supported environment names.

## MCP server

The stdio MCP server rereads saved/environment credentials for every request, uses a 15-second HTTP timeout, and surfaces backend errors.

Its 32 tools are:

- Orientation and memory: `list_projects`, `get_project_context`, `start_experimenting`, `search_experiments`, `get_run`.
- Tags: `list_tags`, `create_tag`, `update_tag`, `delete_tag`.
- Project RTVis: `get_visualization_guide`, `list_visualizations`, `get_visualization`, `preview_visualization`, `generate_visualization`, `update_visualization`, `delete_visualization`, `export_visualization`, `import_visualization`.
- Run-result RTVis: `get_result_visualization_guide`, `list_result_visualization_types`, `create_result_visualization_type`, `delete_result_visualization_type`.
- Experiment loop: `propose_experiment`, `claim_experiment`, `release_experiment`, `create_run`, `log_metric`, `log_metrics`, `log_event`, `finish_run`, `crash_run`, `set_baseline`.

`start_experimenting` returns live context and a one-claim-at-a-time contract; it does not claim or execute by itself. A pending experiment's `worker_id` must also be passed to `create_run`. Artifact upload, parameters, program/exclusion updates, archive/restore/delete, project CRUD, authentication, and membership remain outside MCP; HTTP covers them, with selected operations exposed by the SDK or CLI.

## Operations, distribution, and integrations

- Python 3.11+ package with `mcp`, `server`, `embeddings`, and `dev` extras.
- `mono` and `mono-mcp` console entry points.
- PostgreSQL 17 with pgvector, API, web, and optional MCP Compose services.
- Persistent PostgreSQL, artifact, and optional embedding-model volumes.
- Alembic migrations through PostgreSQL HNSW repair schema version 14; the search-vector HNSW index is created idempotently on fresh and upgraded databases.
- API/web health checks, init processes, and restart policies.
- Public API health at `GET /health`, FastAPI Swagger at `/docs`, OpenAPI JSON at `/openapi.json`, and web-proxied `/api/docs`, `/api/openapi.json`, `/openapi.json`, API, and health routes.
- Configurable CORS origins, artifact-size limit, claim timeout, browser-session/setup-link TTLs, cookie security, and embedding model/cache.
- Source-build installer, fast-forward updater, and destructive demo reset scripts.
- GHCR deployment overlay plus workflows for versioned API/web images.
- GitHub Actions CI runs the locked Python suite, web lint/build, and Compose validation for pushes and pull requests.
- Version tags build and Twine-check wheel/source distributions and attach them to a GitHub Release.
- Direct `v*` tag pushes publish GitHub release artifacts, the trusted-publishing PyPI distribution, and provenance-attested `linux/amd64` API/web images for GHCR; PyPI and container workflows also support validated exact-tag manual recovery.
- Optional demo seed with projects, proposals, runs, metrics, exclusions, and recorded workers, plus a live metric loop and pending-claim keepalive loop.
- Optional FastEmbed semantic indexing; Compose leaves it disabled by default.
- Codex and Claude marketplace/plugin bundles with workflow, setup, and visualization skills.
- `sync_autoresearch_results.py` imports strict `results.tsv` data over rotating HTTP, Python, and MCP transports and authenticates through the normal saved/environment connection. It includes archived rows in deduplication, skips successfully terminal source rows, best-effort crashes post-create failures, marks visible incomplete imports before retry, and retries failed imports rather than treating them as source results.
- AGPL-3.0-only licensing, privacy, plugin terms, deployment, auth, integration, and live-metrics documentation.

## Internal and compatibility-only behavior

These are not public features and should not be advertised as such:

- `AuditEvent` rows record major mutations and idempotency keys, but there is no public audit-history API or web viewer.
- `WorkerObservation` supplies a recorded-worker count for seeded data; Mono does not provide worker discovery, dispatch, or a live heartbeat protocol.
- Passkey/WebAuthn database tables remain for migration compatibility; active authentication is username/password plus agent tokens.
- Research exclusions guide agents but do not enforce or dispatch worker behavior.
- Mono stores and supervises experiments; it does not execute queued experiments on its own.

## Verification

GitHub Actions verifies release-version consistency, runs the locked Python and web test suites, checks lint and TypeScript, builds the Python distributions and production web application, and validates the Compose configuration for pushes and pull requests.
