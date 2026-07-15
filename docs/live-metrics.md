# Live metrics

RunTrace can receive training metrics through the HTTP API, Python SDK, CLI, or MCP server. Every method writes to the same run record, so the dashboard behaves the same regardless of which client sent a point.

## Before you start

1. Start RunTrace and create a project.
2. In a normal instance, create an agent token under **Access → Your agent tokens**.
3. Authenticate once, or export the connection for the process that will send metrics:

```bash
runtrace auth rt_... --base-url https://runtrace.example.com

# Alternative for containers and CI
export RUNTRACE_BASE_URL=https://runtrace.example.com
export RUNTRACE_API_TOKEN=rt_...
```

Open the project dashboard, select a running run, and leave its detail dialog open. Curve metrics, metric summaries, structured events, and run status update while the run is active. The stream normally reflects a committed point within about two seconds and reconnects automatically.

Use a stable metric name and monotonically increasing integer steps. A run accepts new metrics only while its lifecycle is `running`.

## Python SDK

Install the package:

```bash
python -m pip install runtrace-ai
```

The context manager creates the run, records Git and host metadata, reports a crash when the block raises, and finishes an unclosed run when the block exits. Call `log_metric` for one series or `log_metrics` to batch values that share a step.

```python
import os
from runtrace import configure, run

configure(
    os.environ["RUNTRACE_BASE_URL"],
    api_token=os.environ["RUNTRACE_API_TOKEN"],
    strict=True,
)

with run(
    project="dense-optimizer",
    name="adaptive cap schedule",
    hypothesis="late relaxation improves validation loss",
    metric_mode="curve",
) as tracked:
    for step in range(0, 1001, 100):
        train_loss, validation_loss = train_and_evaluate(step)
        tracked.log_metrics(
            {"train_loss": train_loss, "validation_loss": validation_loss},
            step=step,
        )
        tracked.log_event(f"Completed step {step}", event_type="checkpoint")

    tracked.finish(
        "kept",
        result_summary="validation_loss 3.24 at step 1000",
        conclusion="Keep the adaptive schedule.",
    )
```

If another component already created the run, attach the SDK instead of creating a duplicate:

```bash
RUNTRACE_RUN_ID=run_... python train.py
```

## CLI wrapper

`runtrace exec` creates a run and watches the wrapped command's combined stdout and stderr. Print one structured record per line and flush output so it can be sent immediately.

```bash
runtrace exec \
  --project dense-optimizer \
  --name "adaptive cap schedule" \
  --hypothesis "late relaxation improves validation loss" -- \
  python train.py
```

```python
# train.py
for step in range(0, 1001, 100):
    loss = train_and_evaluate(step)
    print(f"RUNTRACE_METRIC validation_loss={loss} step={step}", flush=True)
    print(f'RUNTRACE_EVENT level=info message="completed step {step}"', flush=True)
```

Supported line formats are:

```text
RUNTRACE_METRIC <name>=<number> step=<non-negative integer>
RUNTRACE_EVENT level=<debug|info|warning|error> message="<text>"
```

The `step` field is optional. A zero exit code completes the run as undecided; a nonzero exit code marks it crashed and is returned by the wrapper.

## HTTP API

Create a run, append batches of up to 1,000 points, and finish it. Use a unique `X-Request-ID` for retryable metric batches so a network retry does not duplicate them.

```bash
API=https://runtrace.example.com
PROJECT=dense-optimizer

RUN_ID=$(curl --fail --silent \
  -H "Authorization: Bearer $RUNTRACE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"adaptive cap schedule","hypothesis":"late relaxation improves validation loss","metric_mode":"curve"}' \
  "$API/api/v1/projects/$PROJECT/runs" | jq -r .id)

curl --fail \
  -H "Authorization: Bearer $RUNTRACE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: validation-step-100" \
  -d '{"metrics":[
    {"name":"train_loss","value":3.51,"step":100},
    {"name":"validation_loss","value":3.57,"step":100}
  ]}' \
  "$API/api/v1/runs/$RUN_ID/metrics"
```

Metric points may also include an ISO 8601 `timestamp` and a JSON `context` object. To consume the same live stream as the dashboard:

```bash
curl -N \
  -H "Authorization: Bearer $RUNTRACE_API_TOKEN" \
  "$API/api/v1/runs/$RUN_ID/stream"

# event: metric
# data: {"id":42,"name":"validation_loss","value":3.57,"step":100,...}
```

Finish the run when training ends:

```bash
curl --fail \
  -H "Authorization: Bearer $RUNTRACE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"disposition":"kept","result_summary":"validation_loss 3.24","conclusion":"Keep the adaptive schedule."}' \
  "$API/api/v1/runs/$RUN_ID/finish"
```

## MCP tools

Install the RunTrace plugin for Codex or Claude Code, or configure any stdio MCP host to run:

```bash
uvx --from 'runtrace-ai[mcp]==0.1.3' runtrace-mcp
```

An agent can then use this sequence:

```text
create_run({
  project: "dense-optimizer",
  name: "adaptive cap schedule",
  hypothesis: "late relaxation improves validation loss",
  metric_mode: "curve"
})

log_metric({
  run_id: "run_...",
  name: "validation_loss",
  value: 3.57,
  step: 100
})

log_metrics({
  run_id: "run_...",
  metrics: [
    {"name": "train_loss", "value": 3.51, "step": 200},
    {"name": "validation_loss", "value": 3.48, "step": 200}
  ]
})

log_event({
  run_id: "run_...",
  message: "checkpoint saved",
  event_type: "checkpoint"
})

finish_run({
  run_id: "run_...",
  disposition: "kept",
  result_summary: "validation_loss 3.24",
  conclusion: "Keep the adaptive schedule."
})
```

Choose exactly one tracking owner. If an MCP agent creates the run and launches Python code instrumented with the SDK, pass the returned ID as `RUNTRACE_RUN_ID`. Do not create a second run with `runtrace exec` or another SDK context for the same execution.

## Troubleshooting

- **The chart does not appear:** create the run with `metric_mode: "curve"` and log at least one numeric point.
- **The expected series is not selected:** set the project's progress metric to the exact emitted metric name, or open the run to see its first available curve.
- **HTTP 409 when logging:** the run has already completed or crashed; create a new run rather than reopening it.
- **Updates arrive in bursts:** flush producer output, batch less frequently, and check reverse-proxy buffering. The stream response sets `X-Accel-Buffering: no`.
- **Duplicate runs:** use only one creator and attach other clients with the existing run ID.
