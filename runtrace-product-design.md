# RunTrace Product Design Document

## Current Implementation Handoff

The interactive project-dashboard prototype and all design decisions added during iteration are captured in:

- [`runtrace-implementation-spec.md`](./runtrace-implementation-spec.md) — current behavior, data contracts, agent retrieval semantics, API/MCP surface, persistence requirements, and acceptance criteria
- [`prototype/`](./prototype/) — runnable React/Vite prototype
- [`prototype/AGENTS.md`](./prototype/AGENTS.md) — durable prototype-specific product decisions

When this broader vision document and the implementation specification differ on the current dashboard workflow, use the implementation specification as the source of truth for the next implementation phase.

## 1. Product Overview

### Product Name

**RunTrace**

### Tagline

**Experiment memory that keeps coding agents from repeating themselves.**

Technical descriptor:

> Persistent experiment memory and supervision for autonomous research agents.

### Product Summary

RunTrace is a self-hosted observability, experiment tracking, and retrieval platform for autonomous coding and research agents.

It records:

- hypotheses
- reasoning
- source-code changes
- parameters
- metrics
- system utilization
- logs
- artifacts
- outcomes
- conclusions
- relationships between experiments

RunTrace is designed for agentic research workflows in which an automated system repeatedly modifies code, runs an experiment, evaluates the result, and decides what to try next.

Unlike conventional ML experiment trackers, RunTrace is intended to work across domains and languages. A user may track:

- Python machine-learning experiments
- C++ performance optimization
- compiler benchmarks
- database tuning
- web application performance
- security testing
- simulation workloads
- autonomous software-engineering experiments

The system exposes a web dashboard for human supervision, an HTTP API and CLI for language-independent ingestion, a Python SDK for native integration, and an MCP server that allows agents to search previous experiments before deciding what to try next.

### One-Sentence Product Promise

Before an agent changes code or launches a benchmark, RunTrace shows it what was already tried, what happened, and which evidence should shape the next attempt.

### Primary Job to Be Done

> When I ask a coding agent to improve a system through repeated experiments, help the agent and me remember prior attempts so that each new run builds on evidence instead of starting from a blank context.

---

## OpenAI Build Week Focus

RunTrace should enter the **Developer Tools** category. The Build Week version is not a complete observability platform; it is a polished proof of one valuable closed loop:

```text
search prior experiments -> cite relevant evidence -> choose a different action
-> run and track the experiment -> record the conclusion -> retrieve it later
```

### Why This Fits the Challenge

- **Technological implementation:** Codex uses RunTrace through MCP, while GPT-5.6 synthesizes retrieved experiment evidence into a structured recommendation.
- **Design:** a coherent dashboard makes the agent's hypothesis, evidence, action, live result, and conclusion understandable without reading raw logs.
- **Potential impact:** repeated experiments waste developer time and compute; RunTrace makes prior work reusable across agent sessions.
- **Quality of the idea:** the product treats experimental reasoning and negative results as durable memory, not disposable chat context.

### Three-Minute Demo Thesis

The demo must make one before-and-after contrast obvious:

1. Without RunTrace, a fresh agent proposes an experiment that was already attempted and failed.
2. With RunTrace, the agent retrieves that failure, cites the run, and chooses a better variation.
3. The new run streams one primary metric, finishes, and becomes evidence for the next session.

The hero moment is not the chart. It is the visible proof that retrieved memory changed the agent's decision.

### Build Week Scope Guardrail

Must ship:

- one seeded project with five believable prior runs
- MCP tools for search, run retrieval, run creation, and run completion
- a CLI or Python SDK that tracks one real benchmark
- a project overview, evidence-rich search results, and one excellent run-detail page
- live updates for one primary metric
- a later search that retrieves the newly completed run
- Docker Compose, sample data, and a judge-friendly setup path

Ship only if the core loop is stable:

- two-run comparison
- lightweight experiment lineage
- artifact upload and download
- CPU and memory telemetry

Defer until after Build Week:

- GPU telemetry and broad hardware coverage
- multi-user authentication UI and fine-grained permissions
- advanced hybrid ranking and background-worker infrastructure
- generalized relationship graphs
- multiple native SDKs
- production-scale log ingestion

---

## 2. Problem Statement

Autonomous research agents often operate through a disconnected collection of:

- terminal logs
- Git commits
- benchmark output
- JSON or CSV files
- screenshots
- Markdown notes
- system monitoring tools
- agent conversation history

This creates several problems.

### 2.1 Experiments are forgotten

When an agent starts with a new context, it may repeat an experiment that was already attempted.

### 2.2 Results lack decision context

A metric may indicate that performance improved or regressed, but it does not explain:

- why the experiment was attempted
- what the agent expected
- what code changed
- what was learned
- what should be tried next

### 2.3 Runs are difficult to reproduce

The relevant command, code revision, environment, hardware, parameters, logs, and artifacts are frequently stored separately.

### 2.4 Existing tools are domain-specific

Most experiment trackers focus on machine learning. RunTrace must support any workload capable of emitting metrics or events.

### 2.5 Long-running agents are difficult to supervise

Developers need a central place to see:

- what is running
- why it is running
- what changed
- whether it helped
- what resources it is consuming
- what the agent plans to try next

---

## 3. Product Vision

RunTrace becomes the system of record for autonomous experimentation.

A complete research loop should look like this:

```text
Agent forms a hypothesis
        |
        v
Agent searches previous experiments
        |
        v
Agent chooses a new experiment
        |
        v
Agent modifies code
        |
        v
Agent starts a tracked run
        |
        v
RunTrace records reasoning, code, metrics, logs, artifacts, and hardware
        |
        v
Run completes or fails
        |
        v
Agent records the conclusion
        |
        v
Future agents retrieve the result before trying related work
```

The product should make experimental history understandable to both humans and agents.

---

## 4. Target Users

### 4.1 Primary User

A developer or researcher running autonomous or semi-autonomous software experiments.

Examples:

- an ML researcher using Codex to test optimizer variants
- a systems engineer optimizing C++ throughput
- a developer profiling a web application
- a security engineer testing mitigations
- an agent repeatedly modifying and benchmarking a codebase

### 4.2 Secondary User

A teammate, advisor, or reviewer who needs to inspect the research process without reading raw logs.

### 4.3 Agent User

A coding or research agent that needs to:

- search previous experiments
- inspect related failures
- retrieve artifacts
- compare past runs
- create a new run
- log results
- record conclusions

---

## 5. Product Principles

### 5.1 Reasoning is a first-class artifact

RunTrace must record why an experiment was attempted, not only what happened.

### 5.2 Research outcome is separate from execution status

A run may complete successfully while disproving its hypothesis.

Example:

```text
Execution status: completed
Research outcome: failure
```

### 5.3 The system is language-independent

Python receives the best SDK experience, but any language must be able to integrate through:

- HTTP
- CLI
- JSON Lines
- shell commands

### 5.4 Self-hosting is the default

The application should run locally or on a private server through Docker Compose.

### 5.5 Retrieval must influence future decisions

Search is not a secondary reporting feature. It is part of the agent execution loop.

### 5.6 The MVP must demonstrate one complete closed loop

A narrow but complete agent workflow is more important than broad feature coverage.

---

## 6. MVP Scope

The long-term MVP supports the workflow below. For Build Week, steps marked **demo-critical** form the release gate; the remaining steps may use seeded data or a narrow implementation.

1. A project is created.
2. **Demo-critical:** an agent searches previous experiments.
3. **Demo-critical:** retrieved runs are cited in the next experiment's reasoning.
4. **Demo-critical:** the evidence causes the agent to avoid or modify a previously attempted approach.
5. **Demo-critical:** the agent starts a new tracked run.
6. RunTrace captures code revision and basic system metadata.
7. **Demo-critical:** the run streams a primary metric and notable events.
8. The run uploads at least one small artifact.
9. **Demo-critical:** the run finishes with a result and conclusion.
10. **Demo-critical:** the dashboard displays the run and its evidence trail.
11. **Demo-critical:** a later agent retrieves the completed run through MCP search.

---

## 7. Core Features

## 7.1 Projects

A project groups related experiments.

Example projects:

- `dense-optimizer`
- `cpp-vectorization`
- `web-latency`
- `database-index-tuning`

Project fields:

```text
id
name
slug
description
created_at
updated_at
default_metric
repository_url
```

Project capabilities:

- list runs
- view active runs
- view best runs
- search experiment history
- inspect research lineage
- issue project-scoped API keys

---

## 7.2 Runs

A run represents one experiment.

Required fields:

```text
id
project_id
name
status
outcome
hypothesis
reasoning
change_summary
result_summary
conclusion
started_at
finished_at
command
working_directory
git_commit
git_branch
git_dirty
parent_run_id
source_run_id
host_metadata
environment_metadata
created_by
```

### Run Status

Operational lifecycle:

```text
queued
running
completed
failed
aborted
```

### Research Outcome

Interpretation of the experiment:

```text
success
failure
partial_success
inconclusive
aborted
unknown
```

### Run Relationships

A run may reference another run as:

- parent experiment
- baseline
- retry
- comparison source
- derived experiment
- reproduction attempt

---

## 7.3 Metrics

Metrics are numeric values recorded over time or steps.

Examples:

```text
loss
validation_loss
accuracy
throughput
latency_ms
memory_usage_mb
gpu_utilization
tokens_per_second
requests_per_second
binary_size_bytes
```

Metric fields:

```text
id
run_id
name
value
step
timestamp
context
```

Requirements:

- append-only metric ingestion
- support arbitrary metric names
- support optional step numbers
- support real-time dashboard updates
- support scalar final metrics
- support time-series charts

---

## 7.4 Parameters

Parameters describe the experiment configuration.

Examples:

```json
{
  "learning_rate": 0.02,
  "landing_strength": 0.1,
  "batch_size": 32,
  "compiler_flags": "-O3 -march=native",
  "worker_count": 16
}
```

Parameter values may be:

- string
- integer
- float
- boolean
- JSON object
- JSON array

---

## 7.5 Events

Events capture structured textual information during a run.

Examples:

- warnings
- phase transitions
- agent decisions
- checkpoints
- failures
- notable observations

Event fields:

```text
id
run_id
level
event_type
message
timestamp
metadata
```

Event levels:

```text
debug
info
warning
error
critical
```

---

## 7.6 Reasoning and Conclusions

A run should preserve distinct reasoning stages.

### Before the run

- hypothesis
- motivation
- expected outcome
- related previous runs
- planned changes

### During the run

- observations
- interventions
- warnings
- agent notes

### After the run

- result summary
- conclusion
- whether the hypothesis was supported
- limitations
- next recommended experiment

These fields must be searchable.

---

## 7.7 Artifacts

Artifacts may include:

- logs
- charts
- benchmark output
- source patches
- model checkpoints
- compiled binaries
- profiler traces
- screenshots
- configuration files
- reports

Artifact fields:

```text
id
run_id
name
path
mime_type
size_bytes
storage_backend
checksum
created_at
metadata
```

MVP storage:

- local filesystem

Optional later storage:

- S3-compatible object storage
- MinIO
- cloud object storage

---

## 7.8 Source Control Metadata

RunTrace should automatically capture:

- repository root
- current branch
- current commit
- dirty state
- staged diff summary
- unstaged diff summary
- optional full patch artifact
- remote origin URL

The MVP should not attempt to replace Git.

---

## 7.9 System Monitoring

RunTrace should collect resource utilization for the tracked process and host.

### CPU

- utilization
- process CPU usage
- load average

### Memory

- process memory
- host memory used
- host memory available

### GPU

When NVIDIA hardware is present:

- GPU utilization
- memory used
- memory total
- temperature
- power draw

### Storage

Optional for MVP:

- disk usage
- read throughput
- write throughput

### Collection Method

Python implementation:

- `psutil`
- NVIDIA Management Library through `pynvml`

Samples should be stored as time-series system metrics.

---

## 8. Python SDK

## 8.1 Design Goal

The SDK must make a basic tracked experiment require minimal code.

Example:

```python
import runtrace

with runtrace.run(
    project="dense-optimizer",
    hypothesis="Increasing landing strength may improve early convergence",
    reasoning="Previous runs under-corrected the Gram constraint.",
    tags=["optimizer", "landing"],
) as run:
    run.log_params({
        "learning_rate": 0.02,
        "landing_strength": 0.1,
    })

    for step in range(1000):
        loss = train_step()
        run.log_metric("loss", loss, step=step)

    run.finish(
        outcome="partial_success",
        result_summary="Early convergence improved.",
        conclusion="The run improved initially but became unstable after step 700.",
    )
```

## 8.2 SDK API

Initial public interface:

```python
runtrace.configure(
    base_url="https://runtrace.example.com",
    api_key="rt_live_..."
)

runtrace.create_project(...)
runtrace.run(...)
runtrace.search(...)
```

Run methods:

```python
run.log_metric(name, value, step=None, timestamp=None)
run.log_metrics(values, step=None, timestamp=None)
run.log_param(name, value)
run.log_params(values)
run.log_event(message, level="info", event_type=None, metadata=None)
run.log_reasoning(text, stage="during")
run.log_artifact(path, name=None, metadata=None)
run.set_tags(tags)
run.link_run(run_id, relationship)
run.finish(outcome, result_summary=None, conclusion=None)
run.abort(reason=None)
```

## 8.3 Automatic Capture

The context manager should automatically capture:

- start time
- end time
- elapsed time
- uncaught exceptions
- process exit state
- hostname
- operating system
- Python version
- installed Python packages
- Git metadata
- CPU information
- memory information
- GPU information
- working directory
- command line

## 8.4 Failure Behavior

The SDK must not crash the tracked experiment because the RunTrace server is temporarily unavailable.

Desired behavior:

- queue or buffer recent events locally
- retry with backoff
- emit a warning
- allow the user to configure strict mode

---

## 9. Language-Independent Integration

## 9.1 CLI Wrapper

Example:

```bash
runtrace exec   --project cpp-optimizer   --name avx512-test   --hypothesis "AVX-512 will improve vector throughput"   --reasoning "The current implementation is memory-light and compute-bound"   -- ./benchmark --iterations 10000
```

The wrapper should:

- create the run
- launch the child process
- stream stdout and stderr
- capture exit code
- capture system metrics
- finish the run automatically
- mark failed execution separately from failed research outcome

## 9.2 Structured Standard Output

A process may emit structured lines:

```text
RUNTRACE_METRIC throughput=18200 step=1
RUNTRACE_METRIC latency_ms=4.7 step=1
RUNTRACE_EVENT level=warning message="Cache miss rate increased"
```

The CLI wrapper parses these lines and sends them to the API.

## 9.3 JSON Lines

Alternative structured ingestion:

```json
{"type":"metric","name":"requests_per_second","value":18200,"step":1}
{"type":"metric","name":"p99_latency_ms","value":14.2,"step":1}
{"type":"event","level":"warning","message":"Cache miss rate increased"}
{"type":"artifact","path":"results/profile.json"}
```

## 9.4 HTTP API

Any language capable of sending HTTP requests should be able to integrate directly.

---

## 10. API Design

Base path:

```text
/api/v1
```

## 10.1 Project Endpoints

```http
POST   /projects
GET    /projects
GET    /projects/{project_id}
PATCH  /projects/{project_id}
DELETE /projects/{project_id}
```

## 10.2 Run Endpoints

```http
POST   /runs
GET    /runs
GET    /runs/{run_id}
PATCH  /runs/{run_id}
POST   /runs/{run_id}/finish
POST   /runs/{run_id}/abort
GET    /runs/{run_id}/related
```

## 10.3 Metric Endpoints

```http
POST /runs/{run_id}/metrics
GET  /runs/{run_id}/metrics
```

Batch metric request:

```json
{
  "metrics": [
    {
      "name": "loss",
      "value": 3.41,
      "step": 100,
      "timestamp": "2026-07-13T18:00:00Z"
    }
  ]
}
```

## 10.4 Parameter Endpoints

```http
POST /runs/{run_id}/parameters
GET  /runs/{run_id}/parameters
```

## 10.5 Event Endpoints

```http
POST /runs/{run_id}/events
GET  /runs/{run_id}/events
```

## 10.6 Artifact Endpoints

```http
POST /runs/{run_id}/artifacts
GET  /runs/{run_id}/artifacts
GET  /artifacts/{artifact_id}/download
```

## 10.7 Search Endpoint

```http
POST /search
```

Example request:

```json
{
  "project_id": "project_123",
  "query": "spectral cap after row normalization",
  "filters": {
    "outcomes": ["success", "partial_success", "failure"],
    "tags": ["optimizer"]
  },
  "limit": 10
}
```

---

## 11. Retrieval and Search

## 11.1 Search Goals

The user or agent should be able to ask:

- Have we tried this before?
- Which experiments used a spectral cap?
- What previously improved validation loss?
- Which changes increased throughput but also increased memory use?
- Why was a previous approach abandoned?
- Which run is the best baseline?
- What failed under similar hardware conditions?

## 11.2 Searchable Content

Each run should be converted into a searchable document containing:

- project name
- run name
- hypothesis
- reasoning
- change summary
- parameters
- metric summary
- result summary
- conclusion
- tags
- event summaries
- artifact names
- Git metadata

## 11.3 Hybrid Search

Use a combination of:

- PostgreSQL full-text search
- vector similarity search through `pgvector`
- structured filters

The MVP can rank results using a weighted score or reciprocal-rank fusion.

Conceptual formula:

```text
final_score =
    semantic_similarity_weight
  + keyword_relevance_weight
  + recency_weight
  + structured_match_weight
```

## 11.4 Search Result Format

Each result should return:

```text
run identifier
run name
similarity or relevance score
hypothesis
outcome
key metrics
conclusion excerpt
date
related artifacts
```

Example:

```text
Run: exp167
Outcome: partial success
Final validation loss: 3.309
Runtime: +78%

Conclusion:
Spectral power 0.5 produced the only meaningful quality improvement, but nearly
doubled runtime. A cheaper approximation may be worth testing.
```

## 11.5 Embedding Generation

Embeddings should be generated asynchronously after meaningful run updates.

Trigger points:

- run created
- reasoning updated
- run finished
- conclusion changed
- artifact text indexed

The application should support an embedding provider abstraction.

MVP options:

- OpenAI embeddings
- local embedding model
- configurable provider

---

## 12. MCP Server

## 12.1 Purpose

The MCP server allows Codex and other agents to use RunTrace as persistent experiment memory.

## 12.2 Core MCP Tools

```text
search_experiments
get_run
list_recent_runs
compare_runs
get_best_runs
create_run
log_metric
log_event
log_reasoning
attach_artifact
finish_run
```

## 12.3 Tool Definitions

### `search_experiments`

Purpose:

Search previous hypotheses, changes, outcomes, conclusions, and artifacts.

Inputs:

```json
{
  "project": "dense-optimizer",
  "query": "spectral cap after row normalization",
  "status": "completed",
  "outcomes": ["success", "partial_success", "failure"],
  "limit": 10
}
```

### `get_run`

Purpose:

Retrieve the complete structured record for a run.

Inputs:

```json
{
  "run_id": "run_123"
}
```

### `compare_runs`

Purpose:

Compare parameters, metrics, code revisions, and conclusions.

Inputs:

```json
{
  "run_ids": ["run_123", "run_456"]
}
```

### `get_best_runs`

Purpose:

Retrieve top runs according to a specified metric.

Inputs:

```json
{
  "project": "dense-optimizer",
  "metric": "validation_loss",
  "mode": "min",
  "limit": 5
}
```

### `create_run`

Purpose:

Create an experiment record before execution.

### `finish_run`

Purpose:

Record the research outcome and final conclusion.

## 12.4 MCP Resource Access

Optional MCP resources:

```text
runtrace://projects/{project_id}
runtrace://runs/{run_id}
runtrace://runs/{run_id}/artifacts
runtrace://projects/{project_id}/timeline
```

## 12.5 Agent Usage Pattern

Recommended agent instruction:

```text
Before proposing or implementing an experiment, search RunTrace for related
hypotheses, approaches, metrics, failures, and artifacts. Cite the relevant
run identifiers in the new experiment reasoning.
```

---

## 13. Web Application

## 13.1 Information Architecture

Primary navigation:

```text
Projects
Active Runs
Search
Compare
Artifacts
Settings
```

Inside a project:

```text
Overview
Runs
Timeline
Search
Compare
API Keys
Settings
```

---

## 13.2 Dashboard Home

Show:

- active runs
- recent completed runs
- failed runs
- projects
- resource alerts
- recent agent conclusions

---

## 13.3 Project Overview

Show:

- project description
- current active runs
- best run
- most recent run
- outcome distribution
- latest hypotheses
- primary metric trend
- recent artifacts
- research timeline preview

For Build Week, the top of this page should answer four questions in one screen:

1. What is the agent trying now?
2. Which prior evidence informed that choice?
3. Is the primary metric improving?
4. What did the latest completed run teach us?

---

## 13.4 Run Detail Page

Sections:

### Header

- run name
- status
- outcome
- start and end time
- duration
- tags
- parent or baseline relationship

### Experiment Intent

- hypothesis
- reasoning
- expected outcome
- related prior runs
- an **Evidence used** panel with cited run IDs and the lesson taken from each
- a short **Decision changed** statement explaining what the agent did differently

### Changes

- change summary
- Git commit
- branch
- dirty state
- diff summary
- patch artifact

### Metrics

- line charts
- final values
- min and max
- selected metric controls

### System Utilization

- CPU
- RAM
- GPU utilization
- GPU memory
- temperature
- power

### Events and Logs

- structured event timeline
- stdout
- stderr
- filters by level

### Artifacts

- file list
- preview when supported
- download action

### Result

- result summary
- outcome
- conclusion
- limitations
- recommended next experiment

### Related Runs

- baseline
- parent
- similar experiments
- retries
- derived experiments

---

## 13.5 Compare Page

Users should select two or more runs.

Comparison sections:

- hypotheses
- reasoning
- parameter differences
- metric curves
- final metrics
- runtime
- system utilization
- Git revisions
- change summaries
- outcomes
- conclusions

The interface should clearly highlight differing parameter values.

---

## 13.6 Research Timeline

The timeline visualizes experiment lineage.

Example:

```text
Baseline
   |
   +-- Increase landing strength
   |      Result: instability
   |
   +-- Add spectral cap
   |      Result: partial improvement
   |       |
   |       +-- Change cap schedule
   |              Result: best validation loss
   |
   +-- Remove momentum
          Result: regression
```

Each node should display:

- run name
- outcome
- primary result
- date
- short conclusion

The user should be able to open the full run from the node.

---

## 13.7 Search Interface

The search page should support natural-language queries.

Example:

```text
What experiments tried to control singular values without Newton-Schulz?
```

Filters:

- project
- date range
- status
- outcome
- tags
- metric range
- Git branch
- host

Results should display concise evidence rather than only run titles.

---

## 14. Authentication and Authorization

## 14.1 Human Authentication

MVP options:

1. local administrator account
2. trusted reverse-proxy headers
3. optional disabled-auth mode for localhost development

Preferred production approach:

- authentication handled by a reverse proxy or identity-aware proxy
- RunTrace accepts a trusted user header only from configured proxy addresses

Example:

```text
X-Forwarded-User: user@example.com
```

Compatible external systems may include:

- Authentik
- Authelia
- OAuth2 Proxy
- Cloudflare Access
- Tailscale

## 14.2 API Keys

Agents and SDKs authenticate with project-scoped API keys.

Example format:

```text
rt_live_xxxxxxxxxxxxxxxxx
```

Suggested scopes:

```text
runs:read
runs:write
metrics:write
artifacts:write
search:read
projects:admin
admin
```

Security requirements:

- store only hashed keys
- show the full key only once
- support revocation
- record last-used time
- allow expiration
- allow project restriction

## 14.3 Authorization Model

MVP roles:

```text
admin
member
viewer
```

Project API keys should not need full user-role semantics.

---

## 15. Security Requirements

### 15.1 Default Deployment

- bind services to localhost or internal Docker networks
- expose only the reverse proxy
- do not expose PostgreSQL publicly
- require TLS at the proxy
- use secure cookies
- use CSRF protection for browser state changes

### 15.2 Secret Redaction

RunTrace must never automatically store all environment variables.

Allowlist safe fields such as:

- selected runtime flags
- framework versions
- CUDA version

Redact keys matching patterns such as:

```text
TOKEN
SECRET
PASSWORD
API_KEY
PRIVATE_KEY
CREDENTIAL
```

### 15.3 Artifact Safety

- enforce upload size limits
- sanitize filenames
- prevent path traversal
- calculate checksums
- store outside the static web root
- restrict executable previews
- require authorization for downloads

### 15.4 Reverse Proxy Trust

Trusted authentication headers must only be accepted from explicitly configured proxy IP ranges.

### 15.5 Logging

Avoid logging:

- API keys
- authorization headers
- secrets
- raw environment variables
- sensitive artifact contents

---

## 16. Technical Architecture

```text
                         +--------------------------+
Python SDK -------------->                          |
CLI wrapper ------------->     FastAPI API          |
C++ / shell / web ------->                          |
                         +------------+-------------+
                                      |
                    +-----------------+------------------+
                    |                                    |
             +------v-------+                     +------v-------+
             | PostgreSQL   |                     | Artifact     |
             | + pgvector   |                     | Storage      |
             +------+-------+                     +--------------+
                    |
        +-----------+--------------------+
        |                                |
 +------v------+                  +------v------+
 | Next.js UI |                  | MCP Server  |
 | Dashboard  |                  | Agent Tools |
 +-------------+                  +-------------+
                    |
              +-----v------+
              | Worker     |
              | Embeddings |
              | Indexing   |
              +------------+
```

---

## 17. Recommended Technology Stack

### Recommended Build Week Stack

Use a split TypeScript/Python monorepo. It preserves the best developer experience for the dashboard and the strongest ecosystem for experiment tracking, while remaining realistic to complete during the event.

| Layer | Primary choice | Why it fits RunTrace |
|---|---|---|
| Web app | Next.js, TypeScript, Tailwind CSS, shadcn/ui | Fast dashboard development with polished, reusable UI primitives. |
| Charts | Recharts | Sufficient for live metric and utilization charts with less setup than a heavier visualization library. |
| API | FastAPI, Pydantic, SQLAlchemy, Alembic | Natural fit for the Python SDK, telemetry collectors, typed APIs, and migrations. |
| Database | PostgreSQL with pgvector | One required persistence service for relational data, full-text search, and embeddings. |
| Live updates | Server-Sent Events | Simpler than WebSockets for one-way metric and event streams. |
| Python SDK | `httpx`, Pydantic, `psutil` | Small async-capable client with typed payloads and local telemetry. |
| CLI | Typer or Click | Straightforward `runtrace exec -- <command>` experience. |
| MCP | Official Python MCP SDK | Shares the backend's domain services and avoids a second implementation of business logic. |
| OpenAI | GPT-5.6 through the Responses API; `text-embedding-3-small` for semantic retrieval | GPT-5.6 turns retrieved evidence into a structured next-step recommendation; embeddings improve recall without becoming a hard dependency. |
| Tests | pytest, Vitest, Playwright | Covers services, SDK behavior, and the judge-visible happy path. |
| Local deployment | Docker Compose | Matches the self-hosted promise and gives judges a reproducible startup path. |

### Simplifications That Protect the Deadline

- Use PostgreSQL full-text search first; add embeddings only after keyword search returns good seeded results.
- Use synchronous artifact writes to a mounted local volume.
- Use an in-process background task for embedding generation.
- Use a single local workspace and project-scoped API key; do not build an authentication UI for the demo.
- Stream only the primary metric and important events. Fetch detailed history on page load.
- Keep the MCP server as a thin adapter over the same service layer used by the HTTP API.

### Alternative Stacks

#### Option A: Full TypeScript

```text
Next.js + tRPC or route handlers + Drizzle ORM + PostgreSQL/pgvector
```

Choose this when the team is strongest in TypeScript and wants one language across UI, API, and MCP. The trade-off is a less natural path for the Python-first SDK and process telemetry.

#### Option B: Python-First, Minimal Frontend

```text
FastAPI + Jinja/HTMX + Alpine.js + PostgreSQL/pgvector + Plotly
```

Choose this for the fastest credible end-to-end implementation by a Python-heavy team. The trade-off is less flexibility for a highly interactive compare view and dashboard polish.

#### Option C: Production-Oriented Split Stack

```text
Next.js + FastAPI + PostgreSQL/pgvector + Redis + Dramatiq + S3-compatible storage
```

Choose this after Build Week when ingestion volume, retries, and remote artifact storage justify more infrastructure. Do not start the hackathon with this stack.

### Stack Decision

The recommended default is **Next.js + FastAPI + PostgreSQL/pgvector + SSE + Docker Compose**. It best balances a judge-ready interface, Python-native experiment capture, and a believable path beyond the demo.

### Backend

- Python
- FastAPI
- Pydantic
- SQLAlchemy
- Alembic

### Frontend

- Next.js
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- Recharts or Plotly

### Database

- PostgreSQL
- pgvector
- PostgreSQL full-text search

### Background Processing

MVP:

- FastAPI background tasks or a lightweight worker process

Later:

- Redis
- Celery
- Dramatiq
- task queue abstraction

### Telemetry Collection

- `psutil`
- `pynvml`

### Artifact Storage

MVP:

- local filesystem

Later:

- S3-compatible storage
- MinIO

### Deployment

- Docker
- Docker Compose
- optional Caddy or Traefik configuration

### MCP

- Python MCP SDK
- same domain services as the HTTP API
- separate process or backend-mounted transport

### OpenAI Integration Boundary

RunTrace should remain useful without model calls. OpenAI is used at two explicit boundaries:

1. `text-embedding-3-small` creates optional vectors for experiment-memory retrieval.
2. GPT-5.6 receives the user's goal plus retrieved run evidence and returns a structured recommendation containing cited run IDs, a proposed hypothesis, and the reason this attempt is not a duplicate.

The database, SDK, CLI, dashboards, and keyword search must continue working if OpenAI credentials are absent.

---

## 18. Data Model

## 18.1 Core Entities

```text
User
Project
ProjectMember
APIKey
Run
RunRelationship
Metric
Parameter
Event
Artifact
SystemSample
Tag
RunTag
SearchDocument
Embedding
```

## 18.2 Simplified Relationships

```text
User
  |
  +-- ProjectMember -- Project
                         |
                         +-- Run
                              |
                              +-- Metric
                              +-- Parameter
                              +-- Event
                              +-- Artifact
                              +-- SystemSample
                              +-- RunRelationship
                              +-- SearchDocument
```

## 18.3 Suggested Run Table

```sql
runs
----
id UUID PRIMARY KEY
project_id UUID NOT NULL
name TEXT NOT NULL
status TEXT NOT NULL
outcome TEXT NOT NULL DEFAULT 'unknown'
hypothesis TEXT
reasoning TEXT
change_summary TEXT
result_summary TEXT
conclusion TEXT
command TEXT
working_directory TEXT
git_commit TEXT
git_branch TEXT
git_dirty BOOLEAN
parent_run_id UUID
source_run_id UUID
host_metadata JSONB
environment_metadata JSONB
started_at TIMESTAMPTZ
finished_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

## 18.4 Suggested Metric Table

```sql
metrics
-------
id BIGSERIAL PRIMARY KEY
run_id UUID NOT NULL
name TEXT NOT NULL
value DOUBLE PRECISION NOT NULL
step BIGINT
timestamp TIMESTAMPTZ NOT NULL
context JSONB
```

Recommended index:

```sql
CREATE INDEX metrics_run_name_step_idx
ON metrics (run_id, name, step);
```

## 18.5 Suggested Search Document Table

```sql
search_documents
----------------
id UUID PRIMARY KEY
run_id UUID NOT NULL UNIQUE
content TEXT NOT NULL
tsv TSVECTOR
embedding VECTOR
updated_at TIMESTAMPTZ NOT NULL
```

---

## 19. Real-Time Updates

The dashboard should receive live run updates.

MVP options:

- Server-Sent Events
- WebSockets
- short polling

Recommended MVP:

- Server-Sent Events for metrics and events
- REST for commands and uploads

Reasons:

- simpler than bidirectional WebSockets
- suitable for server-to-browser streaming
- easy to reconnect
- works well for dashboards

---

## 20. Deployment Design

## 20.1 Docker Compose Services

```text
frontend
api
worker
postgres
```

Optional profiles:

```text
caddy
minio
```

## 20.2 Example Local Startup

```bash
docker compose up --build
```

## 20.3 Configuration

Environment variables:

```text
RUNTRACE_DATABASE_URL
RUNTRACE_BASE_URL
RUNTRACE_ARTIFACT_PATH
RUNTRACE_AUTH_MODE
RUNTRACE_TRUSTED_PROXY_CIDRS
RUNTRACE_EMBEDDING_PROVIDER
RUNTRACE_EMBEDDING_MODEL
RUNTRACE_OPENAI_API_KEY
RUNTRACE_MAX_ARTIFACT_SIZE
RUNTRACE_SECRET_KEY
```

Secrets must be provided separately from checked-in configuration.

---

## 21. Demo Scenario

The primary demo should use a real optimizer research workflow.

### Scenario

A Codex agent is asked to improve convergence without using Newton-Schulz.

### Existing History

RunTrace already contains:

- a baseline run
- a row-normalization-only regression
- a spectral-cap experiment
- a high-runtime power-iteration experiment
- an inconclusive schedule experiment

### Demo Flow

1. The user asks Codex to propose the next experiment.
2. Codex calls `search_experiments`.
3. RunTrace returns related attempts and conclusions.
4. Codex determines that a cheaper spectral approximation may be worth testing.
5. Codex creates a new RunTrace run.
6. Codex modifies the optimizer implementation.
7. Codex launches the experiment.
8. The dashboard displays:
   - hypothesis
   - code revision
   - live validation loss
   - GPU utilization
   - GPU memory
   - runtime
9. The run completes.
10. Codex records:
    - result summary
    - outcome
    - conclusion
    - next recommendation
11. The research timeline shows the new experiment branching from the previous spectral-cap run.
12. A second search retrieves the newly completed experiment.

### Demo Success Condition

The audience must clearly see that stored experimental memory changed the agent's decision.

The demo fails this product test if the audience sees only tracking, charts, or a generic semantic-search result. The agent must explicitly cite prior run evidence and state what it will do differently because of that evidence.

---

## 22. Non-Goals for the MVP

The following features are explicitly out of scope:

- Kubernetes orchestration
- remote job scheduling
- remote command execution
- full OpenTelemetry compatibility
- distributed tracing
- general-purpose log management
- multi-tenant billing
- enterprise organization management
- fine-grained RBAC
- custom dashboard builders
- native C++ SDK
- native Rust SDK
- native Java SDK
- native JavaScript SDK
- hyperparameter sweep orchestration
- model registry
- dataset versioning
- full Git hosting integration
- alerting and notification rules
- production OAuth provider implementation
- arbitrary notebook execution
- cloud-hosted SaaS deployment
- automatic experiment planning

---

## 23. Future Extensions

Potential post-MVP work:

- native SDKs for C++, Rust, JavaScript, and Go
- OpenTelemetry ingestion
- GitHub and GitLab integration
- experiment approval workflows
- agent budgets
- cost tracking
- automated result summarization
- automatic duplicate-experiment detection
- experiment planning suggestions
- model and dataset lineage
- distributed runs
- job scheduling
- remote runners
- notebook integrations
- Slack or email alerts
- team workspaces
- immutable audit logs
- signed artifacts
- S3 and MinIO storage
- Prometheus export
- Grafana integration
- plugin system
- benchmark templates

---

## 24. Development Milestones

### Build Week Delivery Sequence

This sequence supersedes the broader milestones below until the submission is complete.

1. **Closed-loop skeleton:** seed five runs, implement `search_experiments`, and prove Codex can retrieve them.
2. **Real tracked run:** implement create, metric ingestion, finish, and one Python SDK or CLI path.
3. **Judge-visible product:** build the project overview, search result cards, and run detail page.
4. **Decision proof:** add evidence citations and the `Decision changed` explanation to both the agent response and UI.
5. **Reliability:** add Docker Compose, sample data, tests for the happy path, and a one-command demo reset.
6. **Submission polish:** record the sub-three-minute demo, finish the README, and document where Codex and GPT-5.6 were used.

Do not move to comparison, lineage, GPU telemetry, or advanced search until steps 1–5 work from a clean checkout.

## Milestone 1: Core Backend

Deliverables:

- FastAPI project
- PostgreSQL schema
- Alembic migrations
- project CRUD
- run CRUD
- metric ingestion
- parameter ingestion
- event ingestion
- artifact upload
- run completion

Acceptance criteria:

- a run can be created, updated, completed, and retrieved
- metrics can be appended
- one artifact can be uploaded and downloaded
- status and research outcome remain separate

---

## Milestone 2: Python SDK and CLI

Deliverables:

- Python package
- context-managed runs
- automatic Git metadata capture
- automatic system metadata capture
- metric and event logging
- CLI `exec` wrapper
- JSON Lines parsing

Acceptance criteria:

- a Python script can be tracked with fewer than ten added lines
- an arbitrary shell or C++ command can be tracked through the CLI
- uncaught exceptions mark the execution as failed
- CLI exit codes are preserved

---

## Milestone 3: Dashboard

Deliverables:

- project list
- project overview
- run list
- run detail page
- metric charts
- system utilization charts
- event timeline
- artifact list

Acceptance criteria:

- active and completed runs are visible
- metrics update without a full page refresh
- the run page shows hypothesis, changes, metrics, logs, and conclusion

---

## Milestone 4: Search and Retrieval

Deliverables:

- searchable run documents
- PostgreSQL full-text search
- pgvector embeddings
- hybrid search endpoint
- search interface

Acceptance criteria:

- a natural-language query returns relevant previous experiments
- search results include outcome and conclusion
- results can be filtered by project, tag, and outcome

---

## Milestone 5: MCP Integration

Deliverables:

- MCP server
- `search_experiments`
- `get_run`
- `compare_runs`
- `create_run`
- `log_metric`
- `finish_run`

Acceptance criteria:

- Codex can search previous experiments
- Codex can create and finish a run
- Codex can retrieve enough context to explain why a related approach succeeded or failed

---

## Milestone 6: Authentication and Deployment

Deliverables:

- project-scoped API keys
- hashed key storage
- reverse-proxy authentication mode
- Docker Compose
- deployment documentation
- secret redaction

Acceptance criteria:

- the system launches with one Docker Compose command
- API requests require a valid key outside development mode
- PostgreSQL is not exposed publicly
- environment secrets are not captured automatically

---

## Milestone 7: Demo and Polish

Deliverables:

- seeded optimizer research project
- experiment lineage
- complete Codex workflow
- polished dashboard states
- empty states
- error states
- README
- architecture diagram
- demo script

Acceptance criteria:

- a reviewer can understand the product within one minute
- the demo shows retrieval changing the next experiment
- the project can be installed and run from documented instructions

---

## 25. MVP Acceptance Criteria

### Build Week Release Gate

The submission is ready when all seven statements are true:

1. A clean checkout starts with documented commands and seeded sample data.
2. Codex can search RunTrace through MCP and cite at least one relevant prior run.
3. The retrieved result visibly changes or narrows the next experiment.
4. A real process creates a run, streams one metric, and records a conclusion.
5. The dashboard explains the hypothesis, evidence, change, result, and next recommendation on one run page.
6. A second search retrieves the newly completed run.
7. The complete story can be demonstrated clearly in under three minutes.

The broader product criteria below remain the post-event MVP target.

The MVP is complete when all of the following are true:

1. A user can create a project.
2. A Python process can create a run and stream metrics.
3. A non-Python executable can be tracked with the CLI wrapper.
4. RunTrace captures Git and host metadata.
5. A run can store hypothesis, reasoning, parameters, events, artifacts, outcome, and conclusion.
6. The dashboard shows active and completed runs.
7. The run page displays metrics and system utilization.
8. A user can compare at least two runs.
9. Natural-language search retrieves related experiments.
10. Codex can use MCP to search previous experiments.
11. Codex can create and finish a tracked run.
12. The research timeline shows parent and derived runs.
13. The application starts through Docker Compose.
14. API keys are scoped and stored securely.
15. One complete demo shows prior experiment memory influencing a new decision.

---

## 26. UX Acceptance Criteria

### Project Overview

- active runs are visible without scrolling on desktop
- the best result is clearly labeled
- failed and inconclusive runs are visually distinct
- recent conclusions are readable without opening each run

### Run Detail

- the hypothesis appears near the top
- execution status and research outcome are shown separately
- charts remain readable with large numbers of metric points
- logs and events can be filtered
- artifacts can be downloaded
- related prior experiments are visible

### Search

- the search input accepts natural language
- results show evidence, not only titles
- each result displays outcome and conclusion
- filters do not require writing query syntax

### Compare

- differing parameters are highlighted
- metric curves can share a chart
- conclusions can be viewed side-by-side

---

## 27. Engineering Constraints

- backend implementation should remain Python-first
- avoid unnecessary infrastructure dependencies
- PostgreSQL should be the only required persistence service
- local artifact storage should work without cloud credentials
- the SDK must tolerate temporary network failures
- the system should remain useful without embeddings
- the dashboard should degrade gracefully when GPU telemetry is unavailable
- no feature should require Kubernetes
- all schemas must be versioned through migrations

---

## 28. Repository Structure

Suggested monorepo:

```text
runtrace/
├── apps/
│   ├── api/
│   ├── web/
│   ├── worker/
│   └── mcp/
├── packages/
│   ├── python-sdk/
│   ├── cli/
│   └── shared-types/
├── infrastructure/
│   ├── docker/
│   ├── caddy/
│   └── migrations/
├── examples/
│   ├── python-training/
│   ├── cpp-benchmark/
│   └── shell-command/
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── mcp.md
│   ├── security.md
│   └── demo.md
├── docker-compose.yml
├── .env.example
├── README.md
└── LICENSE
```

---

## 29. Initial Codex Build Order

Codex should implement the project in this order:

1. establish the monorepo structure
2. create the backend data model
3. add migrations
4. implement project and run APIs
5. implement metric, event, parameter, and artifact ingestion
6. implement the Python SDK
7. implement the CLI wrapper
8. add system and Git metadata capture
9. build the project and run dashboard
10. add live updates
11. build search documents
12. add full-text search
13. add embeddings and hybrid ranking
14. implement MCP tools
15. add authentication and API keys
16. add Docker Compose
17. seed the optimizer research demo
18. complete documentation and tests

Codex should not begin with advanced frontend polish, distributed execution, or broad integrations.

---

## 30. Testing Strategy

### Backend

- unit tests for services
- API integration tests
- migration tests
- authorization tests
- artifact path traversal tests
- API-key hashing and scope tests

### SDK

- context manager success
- context manager exception
- network outage behavior
- buffered metrics
- Git metadata capture
- system metadata capture

### CLI

- child exit code propagation
- stdout parsing
- stderr capture
- JSON Lines ingestion
- interruption handling

### Search

- keyword relevance
- semantic relevance
- structured filters
- empty-result behavior
- embedding provider failure fallback

### MCP

- tool schema validation
- authentication
- search result quality
- create and finish run workflow

### Frontend

- project overview
- run detail loading
- live metric updates
- compare selection
- search filters
- empty and error states

---

## 31. Product Positioning

RunTrace should not be described as a self-hosted replacement for W&B or MLflow.

Preferred positioning:

> RunTrace is the persistent experiment memory and supervision layer for autonomous research agents.

Build Week pitch:

> Coding agents can run experiments, but they often forget what earlier sessions learned. RunTrace gives Codex searchable experiment memory so every new attempt starts from evidence instead of repetition.

Existing tools usually focus on one portion of the workflow:

- Git stores code history.
- experiment trackers store metrics.
- observability systems store telemetry.
- agent tracing tools store model calls.
- filesystems store artifacts.
- conversations store temporary reasoning.

RunTrace connects these into one searchable experiment record that can be used by both humans and agents.

---

## 32. Final Product Definition

RunTrace is a self-hosted platform that gives autonomous research and coding agents persistent memory of previous experiments.

It records what was attempted, why it was attempted, what changed, how the system behaved, what artifacts were produced, whether the hypothesis was supported, and what should happen next.

Its defining feature is not metric tracking alone. Its defining feature is a closed research loop in which an agent retrieves previous experimental evidence before deciding what to try next.
