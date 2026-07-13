# RunTrace Implementation Specification

Status: implementation handoff derived from the interactive prototype and product-design iterations through July 13, 2026.

This document is the authoritative implementation companion to `runtrace-product-design.md`. The product-design document explains the broader vision; this specification records the current project-dashboard behavior, data contracts, agent retrieval semantics, and acceptance criteria demonstrated by the prototype in `prototype/`.

## 1. Current Product Shape

RunTrace is a self-hosted, passive experiment registry shared by people, planning models, and autoresearch workers.

It is not an orchestration controller. RunTrace does not start, stop, schedule, or approve workers from the dashboard. Participating machines independently query the same project, atomically claim proposed experiments, run them, and write results back.

The project dashboard answers four questions:

1. What is the current baseline?
2. Is autoresearch improving the selected metric over time?
3. What is proposed, claimed, running, or completed?
4. What context should the next agent retrieve before acting?

## 2. Information Architecture

### Global level

- Searchable project list
- Project selection
- Project creation
- Workspace-level documentation

The selected project is shown in the sidebar. A left-arrow beside the project name returns to the searchable project list. Project views omit redundant breadcrumb labels.

### Project level

- Dashboard
- Search
- Archive
- Settings
- Research exclusions shortcut

Search, archived records, exclusions, settings, baselines, proposals, runs, metrics, and agent context must always be scoped by `project_id`. General product and API documentation is global and uses project placeholders where needed.

## 3. Dashboard Anatomy

Order of the default project dashboard:

1. Project heading and shared-registry connection summary
2. Autoresearch progress chart
3. Current `main` baseline
4. Lifecycle and disposition counts
5. Shared experiment queue
6. Recent completed experiments

### Autoresearch progress chart

- X-axis: wall-clock time
- Y-axis: improvement relative to the first baseline in the selected time window or an explicitly selected comparison baseline
- Metric selector: any project metric marked as comparable/primary
- Time window selector: seven days, 30 days, or all time in the prototype
- Directionality comes from the metric definition: `higher_is_better` or `lower_is_better`
- Values should be normalized to percentage improvement so differently scaled metrics remain legible
- Only comparable completed runs should contribute to the line
- Hover/focus should reveal timestamp, run, raw value, normalized improvement, and baseline

Recommended normalization:

```text
higher is better: (value - baseline) / abs(baseline) * 100
lower is better:  (baseline - value) / abs(baseline) * 100
```

Do not silently combine incompatible benchmark configurations. A metric series needs a stable evaluation signature or an explicit comparability key.

### Current baseline

- A project has one current baseline for its `main` research line
- Baseline points to a completed run, not a proposal
- Setting a run as baseline is available from the experiment three-dot menu
- Changing the baseline writes an auditable baseline-change event
- The baseline card shows run ID, name, primary result, date, and relevant runtime comparison

## 4. Experiment State Model

Execution lifecycle and research disposition are separate fields.

### Lifecycle

| Value | Meaning | Color |
|---|---|---|
| `proposed` | Available for any worker to claim | Purple |
| `pending` | Atomically claimed or queued by a worker | Orange |
| `running` | Worker has started execution | Blue |
| `completed` | Execution ended successfully | Neutral/derived |
| `crashed` | Execution ended unexpectedly | Red |

### Disposition

| Value | Meaning | Color |
|---|---|---|
| `kept` | Evidence/change retained for future work | Green |
| `discarded` | Valid experiment not adopted | Gray |
| `undecided` | No research conclusion yet | Neutral |

A completed run may be `kept` or `discarded`. A crash is an execution outcome and normally has `undecided` disposition.

### Claim semantics

Claims must be atomic across all participating machines.

Suggested operation:

```text
claim next proposed experiment
where project_id = ?
and lifecycle = proposed
and archived_at is null
and deleted_at is null
order by priority, created_at
for update skip locked
```

The claim writes `claimed_by`, `claimed_at`, and changes lifecycle to `pending` in the same transaction. An optional lease/heartbeat can recover abandoned claims.

## 5. Experiment Record

Suggested logical shape:

```ts
type Experiment = {
  id: string
  projectId: string
  title: string
  hypothesis: string
  reasoning?: string
  implementationDetails?: string
  configuration?: Record<string, unknown>
  source: "human" | "program.md" | "experiments.md" | "agent"
  sourceModel?: string
  lifecycle: "proposed" | "pending" | "running" | "completed" | "crashed"
  disposition: "kept" | "discarded" | "undecided"
  metricMode: "curve" | "timings" | "scalar" | "none"
  dependencyIds: string[]
  claimedBy?: string
  claimedAt?: string
  startedAt?: string
  finishedAt?: string
  codeRevision?: string
  branch?: string
  conclusion?: string
  archivedAt?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
}
```

IDs should be server-generated and collision-safe. The prototype uses readable IDs such as `EXP-024` and `RUN-174`; production may maintain these as project-scoped display IDs backed by UUIDs.

## 6. Experiment Result Display

Each experiment declares the most useful result presentation:

- `curve`: loss, accuracy, or another value over steps/time
- `timings`: a small set of latency/throughput measurements
- `scalar`: one or several final scalar results
- `none`: conclusion and configuration without a graph

The choice is metadata, not a requirement that every experiment emits a curve. Kernel research may only require timing metrics, while optimizer research may require a loss curve.

Metric definitions should include:

```ts
type MetricDefinition = {
  key: string
  label: string
  unit?: string
  direction: "higher_is_better" | "lower_is_better" | "neutral"
  role: "primary" | "guardrail" | "diagnostic"
  comparabilityKey?: string
}
```

## 7. Row Actions

Every active or completed experiment row uses a vertical three-dot menu for secondary actions.

- View/open is a direct icon action where useful
- Set as baseline: enabled only for a comparable completed run
- Archive
- Delete

Delete requires confirmation and removes the record from normal project retrieval. Prefer soft deletion for auditability. Archive is reversible and should be the recommended alternative in the confirmation copy.

## 8. Archive Semantics

Archiving means the experiment should not influence active research.

An archived experiment:

- is hidden from the default dashboard
- is excluded from ordinary project search
- is excluded from claimable proposals
- is excluded from default agent context and recommendations
- remains visible in the project Archive
- can be restored

Provide an explicit `include_archived` option for administrative search or forensic retrieval. Do not let archived records silently re-enter agent context.

## 9. Project Research Context

Each project owns a durable autoresearch context bundle:

- `program.md`
- research exclusions
- current baseline
- metric definitions and evaluation contract
- claimable proposals
- relevant recent evidence
- registry/tool endpoints

### `program.md`

`program.md` is editable in project Settings and should be versioned. It defines:

- research objective
- primary metric
- guardrails
- evaluation procedure
- implementation boundaries
- evidence required to keep a change
- logging/reproducibility requirements

Suggested template:

```markdown
# Project name

Concise research objective.

## Evaluation
- Primary metric and direction
- Guardrails
- Required benchmark configuration

## Implementation
- Allowed modification surface
- Feature-flag or branch requirements
- Reproduction requirements

## Completion
- Evidence required to keep a result
- When to stop or escalate
```

### Research exclusions

Exclusions are project-specific durable constraints, one plain-language rule per line. Examples:

- Do not use SVD
- Do not try Newton-Schulz
- Do not change numerical precision

They are returned to every agent that retrieves the project context. They are guidance/boundaries, not worker-control commands.

## 10. Agent Bootstrap Tool

The prototype presents this conceptual tool call:

```text
runtrace.get_project_context({ project: "dense-optimizer" })
```

Recommended response:

```json
{
  "project": { "id": "...", "slug": "dense-optimizer", "name": "Dense Optimizer" },
  "program": { "content": "# Dense Optimizer...", "version": 12 },
  "exclusions": ["Do not use SVD"],
  "baseline": { "run_id": "...", "display_id": "RUN-168", "metrics": {} },
  "metric_definitions": [],
  "claimable_experiments": [],
  "recent_evidence": [],
  "context_version": "..."
}
```

This retrieval call does not launch or control a worker. A caller launches its own autoresearch process, retrieves this bundle, optionally claims an experiment, and reports work through separate tools.

Recommended MCP/API operations:

- `get_project_context(project)`
- `search_experiments(project, query, include_archived=false)`
- `propose_experiment(project, experiment)`
- `claim_experiment(project, experiment_id?)`
- `start_run(project, experiment_id, revision, config)`
- `log_metrics(run_id, metrics)`
- `complete_run(run_id, disposition, conclusion)`
- `crash_run(run_id, error_summary)`
- `archive_experiment(project, experiment_id)`
- `restore_experiment(project, experiment_id)`
- `set_baseline(project, run_id)`

## 11. `experiments.md` and Agent-Proposed Work

Planning models can write structured experiments with reasoning and implementation details, then hand them to cheaper workers.

Supported ingestion paths:

- human-created proposal form
- planning agent through MCP/API
- import from `experiments.md`
- code already implemented behind flags plus configuration-only experiment records

Import adds `proposed` records to the shared registry. It never dispatches work. Validation should detect duplicate titles/configurations and preserve source/model provenance.

## 12. Project Search, Docs, and Settings

### Search

- Searches only the selected project by default
- Covers proposals, completed runs, reasoning, conclusions, configuration, and metrics
- Excludes archived and deleted records unless explicitly requested

### Docs

The workspace-level Docs destination on the Projects page is reserved for:

- getting started and project setup
- agent retrieval and result-writing API reference
- metric definitions
- future product notes and runbooks

The current prototype contains navigation and placeholder content only.

### Settings

- editable/versioned `program.md`
- editable project goal/description, shown beneath the Dashboard title
- research exclusions
- project slug and registry endpoint
- agent bootstrap tool call
- metric definitions/evaluation contract in a future iteration
- recently connected workers as observational metadata only

## 13. Responsive and Accessibility Requirements

- Mobile summary counts retain colored dots and text labels
- Mobile queue rows use color-led lifecycle dots with accessible names; status text does not force horizontal scrolling
- Icon-only actions require `aria-label` and tooltip/title
- Status cannot rely on color alone; expose semantic text to assistive technology
- Menus and modals must be keyboard operable and manage focus in production
- Graphs require a text summary and accessible title/description
- Respect reduced-motion preferences
- Preserve usable touch targets of approximately 40-44 px for primary mobile controls

## 14. Persistence and Audit Requirements

The React prototype stores state in memory. Production must persist:

- projects and slugs
- program versions
- exclusions and exclusion versions
- proposals and dependencies
- claims/leases
- runs and events
- metric definitions and values
- dispositions and conclusions
- baseline history
- archive/restore/delete events
- worker observations/heartbeats

All state-changing agent operations should be idempotent where possible and include actor, timestamp, and request ID.

Suggested relational entities:

- `projects`
- `project_program_versions`
- `project_exclusions`
- `metric_definitions`
- `experiments`
- `experiment_dependencies`
- `runs`
- `run_metrics`
- `run_events`
- `baseline_events`
- `worker_observations`

## 15. API Surface

Illustrative project-scoped HTTP routes:

```text
GET    /api/v1/projects
GET    /api/v1/projects/:project/context
GET    /api/v1/projects/:project/experiments
POST   /api/v1/projects/:project/experiments
POST   /api/v1/projects/:project/experiments/:id/claim
POST   /api/v1/projects/:project/experiments/:id/archive
POST   /api/v1/projects/:project/experiments/:id/restore
DELETE /api/v1/projects/:project/experiments/:id
POST   /api/v1/projects/:project/baseline
GET    /api/v1/projects/:project/progress
GET    /api/v1/projects/:project/search
GET    /api/v1/projects/:project/program
PUT    /api/v1/projects/:project/program
PUT    /api/v1/projects/:project/exclusions
POST   /api/v1/projects/:project/runs
POST   /api/v1/runs/:run/metrics
POST   /api/v1/runs/:run/complete
POST   /api/v1/runs/:run/crash
```

## 16. Prototype Source Map

- `prototype/src/App.jsx`: interactive seed data, dashboard flows, project selector, progress charts, menus, modals, archive/search/docs/settings views
- `prototype/src/styles.css`: desktop/mobile design system and responsive behavior
- `prototype/AGENTS.md`: durable design decisions for future Codex work
- `prototype/design-qa.md`: earlier visual QA notes
- `runtrace-product-design.md`: product vision and broader MVP scope

The prototype deliberately uses local React state and seeded data. Copy actions simulate success; they do not currently write to the clipboard. MCP/API strings are conceptual contracts until backend tools are implemented.

## 17. Implementation Sequence

1. Establish project, experiment, run, metric, program, exclusion, and baseline schemas.
2. Implement project-scoped HTTP services and atomic claim behavior.
3. Implement MCP tools over the same service layer.
4. Replace prototype seed/local state with project-scoped API queries and mutations.
5. Add live run metric/event streaming.
6. Compute comparable project progress series server-side.
7. Add version history for `program.md`, exclusions, and baselines.
8. Add integration tests for concurrent claims, archive exclusion, project isolation, and context retrieval.

## 18. Acceptance Criteria

- A user can return to a searchable project list and select a project.
- Dashboard, search, archive, docs, exclusions, and settings never leak records across projects.
- An agent retrieves `program.md`, exclusions, baseline, metrics, and claimable experiments in one project-context call.
- Two workers cannot successfully claim the same proposed experiment.
- Proposed and pending are visibly and semantically distinct.
- A completed run can become the baseline through an auditable action.
- Archived experiments disappear from active UI and default agent retrieval, then return after restore.
- Delete requires confirmation and is auditable/soft-deleted in production.
- Projects can use curves, timings, scalar metrics, or no graph per experiment.
- The progress chart changes with metric and time window and uses only comparable data.
- Mobile lifecycle presentation remains compact and accessible.

## 19. Open Implementation Decisions

- Claim lease duration and abandoned-claim recovery policy
- Exact `experiments.md` schema and duplicate-detection strategy
- Whether progress compares against first-ever, window-start, or current baseline by default
- Authentication and authorization model for shared/self-hosted deployments
- Retention policy for soft-deleted records and large metric streams
- Version pinning behavior when an agent retrieves context, then claims work later
