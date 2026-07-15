---
name: runtrace
description: Use when reviewing, claiming, executing, or recording experiments in an already configured RunTrace project, including single and continuous loops.
---

# RunTrace

Use RunTrace as shared experiment memory. Retrieve current state before choosing work, claim one experiment before changing it, and close every run.

## Route the request

- Read [references/workflow.md](references/workflow.md) before planning or executing experiments.
- When the user explicitly asks to start, continue, or loop experiments, call `start_experimenting` and read [references/goals-and-loops.md](references/goals-and-loops.md).
- Use `runtrace-setup` for installation, authentication, repository preflight, or duplicate-run problems.
- Use `runtrace-visualizations` for dashboard widgets or experiment result displays.

## Always

- Use `list_projects` when the canonical project slug is unknown. Never guess identifiers or results.
- Treat RunTrace writes as shared external state. Keep them scoped to the requested project and experiment.
- Never put credentials or private data in hypotheses, parameters, events, artifacts, visualizations, or conclusions.
- If RunTrace is unavailable, report the connection failure and do not imply that work was claimed or recorded.
