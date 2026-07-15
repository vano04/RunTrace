# Experiment loops

Use only when the user explicitly asks to start, continue, or repeatedly run experiments. `start_experimenting(project, worker_id, loop_mode)` returns live context and the loop contract.

## Required inputs

- `project`: canonical slug from context or `list_projects`.
- `worker_id`: stable and unique for this worker/session, such as a branch or agent/session label.
- `loop_mode`: `single` for one claimed experiment or `continuous` for repeated claim-run-close cycles.

## Goal configuration

Create a persistent Goal only when the user explicitly requested experiment execution. Name the project and evidence-preservation outcome; never promise a metric result. Complete it only after every started run is closed and the requested stop condition is met.

## Loop contract

Each cycle is: refresh, search, claim one, create or attach one run, execute, finish or crash, then refresh.

Never hold multiple claims for a sequential loop. Never start the next iteration with an open run.

Stop when requested, the relevant queue is empty, an exclusion applies, required authority/hardware/context is unavailable, or an explicit budget is exhausted. An empty queue is a clean stop.
