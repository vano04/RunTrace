# Prototype Instructions

Implementation handoff: see `../runtrace-implementation-spec.md` for the consolidated data model, API/MCP contract, persistence semantics, and acceptance criteria behind this prototype.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## RunTrace Product Decisions

- The project dashboard is a passive, central experiment registry queried by every participating autoresearch machine; it is not an orchestration controller.
- Experiments enter the shared queue as `Proposed`. Workers independently claim proposed experiments, run them, and write results back.
- Do not add global autoresearch toggles, scheduler controls, worker start/stop controls, or approval gates to the default dashboard.
- Keep execution lifecycle (`Proposed`, `Running`, `Completed`, `Crashed`) separate from research disposition (`Kept`, `Discarded`).
- The `main` branch is the current kept baseline that future experiments iterate from.
- `Proposed` means available in the shared registry and uses purple; `Pending` means claimed or queued on a worker and uses orange.
- On mobile, lifecycle should be conveyed primarily with color indicators and accessible labels so status text does not force wide rows.
- Experiments can opt into a loss curve, timing metrics, scalar metrics, or no graph depending on the research domain.
- Archived experiments are excluded from active dashboards and agent retrieval, but remain available in a separate archive.
- Project-level research exclusions are durable agent context, such as `Do not use SVD` or `Do not try Newton–Schulz`.
- Search, archive, exclusions, and research settings belong to the currently selected project rather than a global workspace.
- Each experiment uses a three-dot context menu for secondary actions such as setting the baseline, archiving, or deleting.
- Project settings define the `program.md` bootstrap contract returned to autoresearch agents alongside the baseline, exclusions, and proposed experiments.
- The primary project view is named `Dashboard`; a back arrow beside the selected project opens a searchable project list.
- Project views omit redundant breadcrumb labels; the selected project is already visible in the sidebar.
- Projects are created from the main Projects page, which also owns the global Docs destination.
- Each project has an editable goal/description in Settings, and that goal stays visible beneath the Dashboard title.
- Each project dashboard starts with an autoresearch progress chart whose metric and time window can be changed.
- The progress metric is configured per project in Settings using the exact metric name emitted by Python or an autoresearch agent (for example `val_loss` or `compilation_time`) plus whether lower or higher is better.
- Autoresearch progress is a best-so-far step chart: only strict improvements advance the blue staircase; equal or worse observations are not connected as improvements and appear as orange dots at their observed values.
- Docs is workspace-level reference material reached from the main Projects page, not from an individual project.
