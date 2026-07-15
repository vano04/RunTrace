# Repository preflight

## Resolve the target

Verify the saved connection without printing credentials. Use `list_projects` for the canonical slug; ask if several projects match. Retrieve context and confirm its program, exclusions, metric, baseline, and queue belong to this repository.

## Inspect before changing

Search for SDK contexts, `runtrace exec`, `RUNTRACE_RUN_ID`, `--no-track`, metric output, and crash handling. Identify the experiment command, run creator/closer, claim linkage, evidence recorded, crash path, and baseline policy.

## Select one owner

- **Embedded SDK:** let the program create, log, and close its run.
- **MCP plus SDK child:** create once through MCP, then pass `RUNTRACE_RUN_ID=<returned id>` so the SDK attaches.
- **CLI wrapper:** use `runtrace exec` only when the child is not already creating a run.
- **MCP only:** use for uninstrumented work whose required evidence can be recorded through MCP.

Never combine creators. Verify an older SDK supports attachment before relying on the environment variable.

## Prove readiness cheaply

Use existing tests or a cheap smoke path. Confirm one execution creates one run, metrics land on it, and an intentional failure closes it as crashed. Do not launch research merely to validate setup.

Report the slug, tracking owner, command, claim linkage, evidence, crash path, baseline policy, verification, and blockers.
