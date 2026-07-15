# Effective RunTrace workflow

## Orient before acting

1. Resolve the canonical slug with `list_projects` when needed. Call `get_project_context`, or `start_experimenting` when execution was explicitly requested.
2. Summarize the goal, exclusions, baseline, primary metrics, queue, and evidence that changes the plan.
3. Search the relevant method, subsystem, metric, or failure mode before choosing work.

## Choose one tracking owner

Every execution attempt has exactly one run. Before creating it, determine whether the command already uses the SDK, is wrapped by `runtrace exec`, or needs MCP tracking.

- Let embedded SDK instrumentation create the run when it already owns the lifecycle.
- If MCP creates the run and the child process uses the SDK, pass the returned ID as `RUNTRACE_RUN_ID`; the SDK attaches to that running record.
- Use MCP-only tracking for uninstrumented commands when configuration and artifacts can be recorded through the available interface.
- Never create a run through MCP and another through the SDK for the same process.

## Choose and claim work

- Claim one relevant proposal with a stable session worker ID before editing. On conflict, refresh context.
- Propose then claim only when no existing proposal fits.
- Release a claim if work stops before a run exists. Once started, close the run.

## Execute a run

1. Create or attach the single run when execution begins. Include the claim, hypothesis, reasoning, evidence, decision change, and relevant configuration.
2. Preserve the proposal's result display unless intentionally overriding it.
3. Prefer `log_metrics` for related points; use stable names and steps. Log meaningful decisions and failures as events.
4. Use `finish_run` for completed positive or negative results and `crash_run` for unexpected process failure.
5. Use `set_baseline` only for a completed, comparable run and explain why it is comparable.

## Continue safely

Refresh context and evidence after every closed run. Claim the next experiment only after the current run is terminal. Preserve failures as evidence.
