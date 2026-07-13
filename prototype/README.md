# RunTrace Web Client

This React/Vite application implements the project-scoped RunTrace MVP. It connects to the FastAPI registry for persisted projects, experiments, runs, search, progress, settings, archive actions, and live SSE updates. The accepted prototype remains the visual reference.

## Run

```bash
npm install
npm run dev
```

Production build check:

```bash
npm run build
```

## Demonstrated flows

- searchable project selector reached from the sidebar back arrow
- project-scoped Dashboard, Search, Archive, Docs, and Settings
- autoresearch progress chart with metric and time-window selectors
- current baseline and baseline replacement from experiment menus
- proposed, pending/claimed, running, kept, discarded, and crashed states
- per-experiment loss-curve, timing, scalar, or no-graph modes
- add/import proposed experiments
- three-dot experiment actions: set baseline, archive, and delete
- archive/restore and exclusion from active/search views
- editable research exclusions and `program.md`
- conceptual `get_project_context` bootstrap tool call
- responsive, color-led lifecycle presentation on mobile

## MVP boundaries

- The app falls back to bundled demo data when the API is unavailable so visual development remains usable.
- Charts use lightweight native SVG rather than a charting dependency.
- Authentication and multi-user authorization are intentionally outside the local-first MVP scope.
- Semantic embeddings, compare/timeline views, GPU telemetry, and hosted deployment are deferred per the implementation specification.

## Implementation references

- [`../runtrace-implementation-spec.md`](../runtrace-implementation-spec.md): authoritative implementation handoff
- [`../runtrace-product-design.md`](../runtrace-product-design.md): broader product vision and MVP
- [`AGENTS.md`](./AGENTS.md): durable prototype decisions
- [`design-qa.md`](./design-qa.md): prior visual QA notes
