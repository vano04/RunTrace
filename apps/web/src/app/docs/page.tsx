"use client"

import Link from "next/link"
import { Activity, ArrowLeft, BookOpen, Braces, CircleDot, Code2, Database, GitBranch, Plug, Radio, Search, Terminal } from "lucide-react"

import { MonoLogo } from "@/components/mono-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/components/i18n-provider"

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg border bg-zinc-950 p-4 font-mono text-xs leading-6 text-zinc-100"><code>{children}</code></pre>
}

function DocSection({ id, title, icon: Icon, children }: { id: string; title: string; icon: typeof BookOpen; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-8 border-b py-10 last:border-0"><h2 className="mb-4 flex items-center gap-2 text-xl font-semibold tracking-tight"><Icon className="size-5 text-primary" />{title}</h2><div className="space-y-5 text-sm leading-7 text-muted-foreground">{children}</div></section>
}

export default function DocsPage() {
  const { rich, t } = useI18n()
  const sections = [
    { id: "start", label: t("Quick start") },
    { id: "concepts", label: t("Core concepts") },
    { id: "live", label: t("Live metrics") },
    { id: "python", label: t("Python SDK") },
    { id: "cli", label: "CLI" },
    { id: "mcp", label: t("MCP") },
    { id: "plugins", label: t("Codex & Claude") },
    { id: "http", label: t("HTTP & SSE") },
    { id: "lifecycle", label: t("Lifecycle") },
  ]

  return <main className="mx-auto min-h-screen w-full max-w-7xl px-5 sm:px-8">
    <header className="flex h-20 items-center justify-between border-b"><MonoLogo /><Button variant="ghost" render={<Link href="/" />} nativeButton={false}><ArrowLeft data-icon="inline-start" />{t("Projects")}</Button></header>
    <div className="grid gap-12 py-10 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden lg:block"><nav className="sticky top-8 space-y-1" aria-label={t("Documentation sections")}>{sections.map((section) => <a key={section.id} href={`#${section.id}`} className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{section.label}</a>)}</nav></aside>
      <article className="min-w-0 max-w-4xl">
        <div className="border-b pb-10"><Badge variant="secondary"><BookOpen />Mono v0.1</Badge><h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">{t("Build a durable memory for autonomous experiments.")}</h1><p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{t("Mono keeps proposals, Git metadata, live metrics, artifacts, decisions, and reusable conclusions in one project-scoped registry. The dashboard, SDK, CLI, HTTP API, and MCP server all use the same records.")}</p></div>

        <DocSection id="start" title={t("Quick start")} icon={Terminal}>
          <p>{rich("Start the self-hosted stack, then open the dashboard at {address}. Normal mode starts empty and persists data in PostgreSQL.", { address: <code className="rounded bg-muted px-1.5 py-0.5">localhost:3000</code> })}</p>
          <Code>{`docker compose up --build

# Seeded development preview
MONO_DEV=true docker compose up --build

# Real app, seeded and server-enforced read-only
MONO_DEMO=true docker compose up --build`}</Code>
          <p>{t("For native Python development, install the workspace package and save the known local connection once:")}</p>
          <Code>{`uv sync --all-extras
uv run mono auth rt_mono_dev --base-url http://localhost:8000`}</Code>
        </DocSection>

        <DocSection id="concepts" title={t("Core concepts")} icon={Database}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4"><dt className="font-medium text-foreground">{t("Project")}</dt><dd>{t("A durable research goal, program.md, exclusions, tags, progress metric, and baseline.")}</dd></div>
            <div className="rounded-lg border p-4"><dt className="font-medium text-foreground">{t("Experiment")}</dt><dd>{t("A proposed change with a hypothesis, reasoning, implementation diff, display mode, and claim state.")}</dd></div>
            <div className="rounded-lg border p-4"><dt className="font-medium text-foreground">{t("Run")}</dt><dd>{t("An execution record containing source branch and commit, metrics, events, parameters, artifacts, and conclusion.")}</dd></div>
            <div className="rounded-lg border p-4"><dt className="font-medium text-foreground">{t("Baseline")}</dt><dd>{t("A completed run selected as the project comparison point for progress and live curves.")}</dd></div>
          </dl>
        </DocSection>

        <DocSection id="live" title={t("Live metrics")} icon={Activity}>
          <p>{t("HTTP, Python, CLI, and MCP metrics all enter the same run stream. Open a project, select a running run, and leave its details open: curve points, metric summaries, structured events, and lifecycle status update as data is committed.")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4"><strong className="text-foreground">{t("Python SDK")}</strong><p className="mt-1">{rich("Instrument training code with {logMetric} or batch related series with {logMetrics}.", { logMetric: <code className="rounded bg-muted px-1.5 py-0.5">log_metric</code>, logMetrics: <code className="rounded bg-muted px-1.5 py-0.5">log_metrics</code> })}</p></div>
            <div className="rounded-lg border p-4"><strong className="text-foreground">{t("CLI wrapper")}</strong><p className="mt-1">{t("Wrap an unchanged process and print structured metric or event lines to flushed stdout.")}</p></div>
            <div className="rounded-lg border p-4"><strong className="text-foreground">{t("HTTP API")}</strong><p className="mt-1">{t("Create a run and post metric batches directly from any language or service.")}</p></div>
            <div className="rounded-lg border p-4"><strong className="text-foreground">{t("MCP tools")}</strong><p className="mt-1">{t("Let an agent create the run, log evidence during execution, and record its conclusion.")}</p></div>
          </div>
          <p>{rich("Use a stable metric name, monotonically increasing integer steps, and {mode}. New points are accepted only while the run is {status} and normally appear within about two seconds.", { mode: <code className="rounded bg-muted px-1.5 py-0.5">metric_mode: &quot;curve&quot;</code>, status: <Badge variant="outline">{t("running")}</Badge> })}</p>
          <p>{rich("{emphasis} Choose one component to create it. If an MCP agent creates a run before launching an instrumented Python process, pass the returned ID as {runId} so the SDK attaches to that record.", { emphasis: <strong className="text-foreground">{t("One execution should have one run.")}</strong>, runId: <code className="rounded bg-muted px-1.5 py-0.5">MONO_RUN_ID</code> })}</p>
        </DocSection>

        <DocSection id="python" title={t("Python SDK")} icon={Code2}>
          <p>{t("The context manager creates the run and captures its Git branch, commit, command, host metadata, and completion or crash state. Metrics are buffered briefly if the API is unavailable.")}</p>
          <Code>{`import os
from mono import configure, run

configure("http://localhost:8000", api_token=os.environ["MONO_API_TOKEN"], strict=True)

with run(
    project="dense-optimizer",
    name="adaptive cap schedule",
    hypothesis="late relaxation improves loss within the guardrail",
    tags=["schedule"],
) as tracked:
    for step in range(0, 1001, 100):
        train_loss, validation_loss = train_and_evaluate(step)
        tracked.log_metrics(
            {"train_loss": train_loss, "validation_loss": validation_loss},
            step=step,
        )
        tracked.log_event(f"Completed step {step}", event_type="checkpoint")
    tracked.log_config({"cap_start": 0.85, "relax_step": 600})
    tracked.finish("kept", "3.24 at step 1000", "Improved the baseline reproducibly.")`}</Code>
          <p>{rich("If a run already exists, start the process with {command}. The SDK validates and attaches to that running record instead of creating a duplicate.", { command: <code className="rounded bg-muted px-1.5 py-0.5">MONO_RUN_ID=run_... python train.py</code> })}</p>
        </DocSection>

        <DocSection id="cli" title="CLI" icon={Search}>
          <p>{t("Use the CLI to bootstrap an agent, retrieve prior evidence, or wrap any command that emits structured output. Flush each line in long-running programs so it reaches the dashboard immediately.")}</p>
          <Code>{`mono context dense-optimizer
mono search dense-optimizer "spectral changes that exceeded runtime"

mono exec --project dense-optimizer \\
  --name "adaptive cap" \\
  --hypothesis "late relaxation improves convergence" -- \\
  python benchmark.py

# benchmark.py can print and flush:
MONO_METRIC validation_loss=3.24 step=1000
MONO_EVENT level=info message="checkpoint saved"`}</Code>
          <p>{t("The step is optional. A zero exit code completes the run as undecided; a nonzero exit code records a crash and is returned by the wrapper.")}</p>
        </DocSection>

        <DocSection id="mcp" title={t("MCP server")} icon={Braces}>
          <p>{t("Run the stdio server to let coding agents retrieve context, propose and claim work, log live evidence, and finish runs without custom integration code.")}</p>
          <Code>{`uvx --from 'mono-research[mcp]==0.1.6' mono-mcp

# Typical agent sequence
get_project_context({ project: "dense-optimizer" })
search_experiments({ project: "dense-optimizer", query: "runtime regressions" })
claim_experiment({ project: "dense-optimizer", worker_id: "autoresearch/Jul14" })
create_run({ project: "dense-optimizer", experiment_id: "exp_...", worker_id: "autoresearch/Jul14", name: "...", hypothesis: "..." })
log_metric({ run_id: "run_...", name: "validation_loss", value: 3.24, step: 1000 })
finish_run({ run_id: "run_...", disposition: "kept", result_summary: "...", conclusion: "..." })`}</Code>
        </DocSection>

        <DocSection id="plugins" title={t("Codex and Claude Code")} icon={Plug}>
          <p>{rich("Install the PyPI tool and repository marketplace from either CLI. The plugin bundles the Mono skill, starts the authenticated MCP server with {command}, and rereads the CLI's saved credential on every request.", { command: <code className="rounded bg-muted px-1.5 py-0.5">uvx</code> })}</p>
          <Code>{`uv tool install mono-research

# Codex app and CLI
codex plugin marketplace add vano04/Mono --ref master
codex plugin add mono@mono

# Claude Code
claude plugin marketplace add vano04/Mono
claude plugin install mono@mono --scope user

# If the Mono CLI is already installed
mono integrations install codex
mono integrations install claude

# Local development; use an Access token instead for a normal instance
mono auth rt_mono_dev --base-url http://localhost:8000`}</Code>
          <p>{rich("For a normal instance, create a token under {access} and pass it to {command}. Codex and Claude then use the saved connection without shell exports or a restart.", { access: <strong className="text-foreground">{t("Access → Your agent tokens")}</strong>, command: <code className="rounded bg-muted px-1.5 py-0.5">mono auth</code> })}</p>
        </DocSection>

        <DocSection id="http" title={t("HTTP API and live streams")} icon={Radio}>
          <p>{rich("All API routes are under {path}. Create a run, append batches of up to 1,000 points, and then finish it. Give retryable metric batches a unique {requestId} to avoid duplicates.", { path: <code className="rounded bg-muted px-1.5 py-0.5">/api/v1</code>, requestId: <code className="rounded bg-muted px-1.5 py-0.5">X-Request-ID</code> })}</p>
          <Code>{`API=http://localhost:8000

# Create a running curve
curl -H "Authorization: Bearer $MONO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"adaptive cap","hypothesis":"improve validation loss","metric_mode":"curve"}' \
  "$API/api/v1/projects/dense-optimizer/runs"

# Use the id returned above
RUN_ID=run_...
curl -H "Authorization: Bearer $MONO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: validation-step-100" \
  -d '{"metrics":[{"name":"validation_loss","value":3.57,"step":100}]}' \
  "$API/api/v1/runs/$RUN_ID/metrics"

curl -N -H "Authorization: Bearer $MONO_API_TOKEN" \
  "$API/api/v1/runs/$RUN_ID/stream"
# event: metric
# data: {"id":42,"name":"validation_loss","value":3.57,"step":100,...}`}</Code>
          <p>{t("Metric points may include an ISO 8601 timestamp and JSON context. The SSE connection reconnects automatically in the dashboard and closes after the run completes or crashes.")}</p>
          <Code>{`curl -H "Authorization: Bearer $MONO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"disposition":"kept","result_summary":"validation_loss 3.24","conclusion":"Keep the adaptive schedule."}' \
  "$API/api/v1/runs/$RUN_ID/finish"`}</Code>
          <Button render={<a href="/api/docs" target="_blank" rel="noreferrer" />} nativeButton={false}><BookOpen data-icon="inline-start" />{t("Open interactive API reference")}</Button>
        </DocSection>

        <DocSection id="lifecycle" title={t("Experiment lifecycle and recovery")} icon={CircleDot}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground"><Badge variant="outline">{t("proposed")}</Badge><span>→</span><Badge variant="outline">{t("pending")}</Badge><span>→</span><Badge variant="outline">{t("running")}</Badge><span>→</span><Badge variant="outline">{t("completed")} / {t("crashed")}</Badge></div>
          <p>{t("Claims are atomic. A graceful autoresearch shutdown should release its pending proposal; abandoned pending claims automatically return to proposed after the configured claim timeout. Starting a run moves its experiment to running, and finishing or crashing the run closes the experiment with the same outcome.")}</p>
          <p className="flex items-center gap-2"><GitBranch className="size-4" />{rich("Every run records the Git branch and commit used, so dashboard history can be traced back to branches such as {branch}.", { branch: <code className="rounded bg-muted px-1.5 py-0.5">autoresearch/Jul4</code> })}</p>
        </DocSection>
      </article>
    </div>
  </main>
}
