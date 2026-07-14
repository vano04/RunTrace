import Link from "next/link"
import { ArrowLeft, BookOpen, Braces, CircleDot, Code2, Database, GitBranch, Plug, Radio, Search, Terminal } from "lucide-react"

import { RunTraceLogo } from "@/components/runtrace-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const sections = [
  { id: "start", label: "Quick start" },
  { id: "concepts", label: "Core concepts" },
  { id: "python", label: "Python SDK" },
  { id: "cli", label: "CLI" },
  { id: "mcp", label: "MCP" },
  { id: "plugins", label: "Codex & Claude" },
  { id: "http", label: "HTTP & SSE" },
  { id: "lifecycle", label: "Lifecycle" },
]

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg border bg-zinc-950 p-4 font-mono text-xs leading-6 text-zinc-100"><code>{children}</code></pre>
}

function DocSection({ id, title, icon: Icon, children }: { id: string; title: string; icon: typeof BookOpen; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-8 border-b py-10 last:border-0"><h2 className="mb-4 flex items-center gap-2 text-xl font-semibold tracking-tight"><Icon className="size-5 text-primary" />{title}</h2><div className="space-y-5 text-sm leading-7 text-muted-foreground">{children}</div></section>
}

export default function DocsPage() {
  return <main className="mx-auto min-h-screen w-full max-w-7xl px-5 sm:px-8">
    <header className="flex h-20 items-center justify-between border-b"><RunTraceLogo /><Button variant="ghost" render={<Link href="/" />} nativeButton={false}><ArrowLeft data-icon="inline-start" />Projects</Button></header>
    <div className="grid gap-12 py-10 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden lg:block"><nav className="sticky top-8 space-y-1" aria-label="Documentation sections">{sections.map((section) => <a key={section.id} href={`#${section.id}`} className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{section.label}</a>)}</nav></aside>
      <article className="min-w-0 max-w-4xl">
        <div className="border-b pb-10"><Badge variant="secondary"><BookOpen />RunTrace v0.1</Badge><h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Build a durable memory for autonomous experiments.</h1><p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">RunTrace keeps proposals, Git metadata, live metrics, artifacts, decisions, and reusable conclusions in one project-scoped registry. The dashboard, SDK, CLI, HTTP API, and MCP server all use the same records.</p></div>

        <DocSection id="start" title="Quick start" icon={Terminal}>
          <p>Start the self-hosted stack, then open the dashboard at <code className="rounded bg-muted px-1.5 py-0.5">localhost:3000</code>. Normal mode starts empty and persists data in PostgreSQL.</p>
          <Code>{`docker compose up --build

# Seeded development preview
RUNTRACE_DEV=true docker compose up --build`}</Code>
          <p>For native Python development, install the workspace package and point clients at the API:</p>
          <Code>{`uv sync --all-extras
export RUNTRACE_BASE_URL=http://localhost:8000
export RUNTRACE_API_TOKEN=rt_...`}</Code>
        </DocSection>

        <DocSection id="concepts" title="Core concepts" icon={Database}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4"><dt className="font-medium text-foreground">Project</dt><dd>A durable research goal, program.md, exclusions, tags, progress metric, and baseline.</dd></div>
            <div className="rounded-lg border p-4"><dt className="font-medium text-foreground">Experiment</dt><dd>A proposed change with a hypothesis, reasoning, implementation diff, display mode, and claim state.</dd></div>
            <div className="rounded-lg border p-4"><dt className="font-medium text-foreground">Run</dt><dd>An execution record containing source branch and commit, metrics, events, parameters, artifacts, and conclusion.</dd></div>
            <div className="rounded-lg border p-4"><dt className="font-medium text-foreground">Baseline</dt><dd>A completed run selected as the project comparison point for progress and live curves.</dd></div>
          </dl>
        </DocSection>

        <DocSection id="python" title="Python SDK" icon={Code2}>
          <p>The context manager captures the current Git branch, commit, command, host metadata, and completion or crash state. Metrics are buffered briefly if the API is unavailable.</p>
          <Code>{`import os
from runtrace import configure, run

configure("http://localhost:8000", api_token=os.environ["RUNTRACE_API_TOKEN"], strict=True)

with run(
    project="dense-optimizer",
    name="adaptive cap schedule",
    hypothesis="late relaxation improves loss within the guardrail",
    tags=["schedule"],
) as tracked:
    for step in range(0, 1001, 100):
        tracked.log_metric("validation_loss", evaluate(step), step=step)
    tracked.log_config({"cap_start": 0.85, "relax_step": 600})
    tracked.finish("kept", "3.24 at step 1000", "Improved the baseline reproducibly.")`}</Code>
        </DocSection>

        <DocSection id="cli" title="CLI" icon={Search}>
          <p>Use the CLI to bootstrap an agent, retrieve prior evidence, or wrap any command that emits structured output.</p>
          <Code>{`runtrace context dense-optimizer
runtrace search dense-optimizer "spectral changes that exceeded runtime"

runtrace exec --project dense-optimizer \\
  --name "adaptive cap" \\
  --hypothesis "late relaxation improves convergence" -- \\
  python benchmark.py

# benchmark.py can print:
RUNTRACE_METRIC validation_loss=3.24 step=1000
RUNTRACE_EVENT level=info message="checkpoint saved"`}</Code>
        </DocSection>

        <DocSection id="mcp" title="MCP server" icon={Braces}>
          <p>Run the stdio server to let coding agents retrieve context, propose and claim work, log live evidence, and finish runs without custom integration code.</p>
          <Code>{`uvx --from 'runtrace-ai[mcp]==0.1.2' runtrace-mcp

# Typical agent sequence
get_project_context({ project: "dense-optimizer" })
search_experiments({ project: "dense-optimizer", query: "runtime regressions" })
claim_experiment({ project: "dense-optimizer", worker_id: "autoresearch/Jul14" })
create_run({ project: "dense-optimizer", experiment_id: "exp_...", name: "..." })
log_metric({ run_id: "run_...", name: "validation_loss", value: 3.24, step: 1000 })
finish_run({ run_id: "run_...", disposition: "kept", result_summary: "...", conclusion: "..." })`}</Code>
        </DocSection>

        <DocSection id="plugins" title="Codex and Claude Code" icon={Plug}>
          <p>Install the repository marketplace from either CLI. The plugin bundles the RunTrace skill and starts the authenticated MCP server with <code className="rounded bg-muted px-1.5 py-0.5">uvx</code>.</p>
          <Code>{`# Codex app and CLI
codex plugin marketplace add vano04/RunTrace --ref master
codex plugin add runtrace@runtrace

# Claude Code
claude plugin marketplace add vano04/RunTrace
claude plugin install runtrace@runtrace --scope user

# If the RunTrace CLI is already installed
runtrace integrations install codex
runtrace integrations install claude`}</Code>
          <p>Create a token under <strong className="text-foreground">Access → Your agent tokens</strong>, then export <code className="rounded bg-muted px-1.5 py-0.5">RUNTRACE_BASE_URL</code> and <code className="rounded bg-muted px-1.5 py-0.5">RUNTRACE_API_TOKEN</code> before starting the agent host.</p>
        </DocSection>

        <DocSection id="http" title="HTTP API and live streams" icon={Radio}>
          <p>All API routes are under <code className="rounded bg-muted px-1.5 py-0.5">/api/v1</code>. Mutating requests accept <code className="rounded bg-muted px-1.5 py-0.5">X-Request-ID</code> for idempotency where applicable. Run streams use Server-Sent Events.</p>
          <Code>{`curl -H "Authorization: Bearer $RUNTRACE_API_TOKEN" \
  http://localhost:8000/api/v1/projects/dense-optimizer/context

curl -N -H "Authorization: Bearer $RUNTRACE_API_TOKEN" \
  http://localhost:8000/api/v1/runs/RUN-174/stream
# event: metric
# data: {"name":"validation_loss","value":3.404,"step":600,...}`}</Code>
          <Button render={<a href="/api/docs" target="_blank" rel="noreferrer" />} nativeButton={false}><BookOpen data-icon="inline-start" />Open interactive API reference</Button>
        </DocSection>

        <DocSection id="lifecycle" title="Experiment lifecycle and recovery" icon={CircleDot}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground"><Badge variant="outline">proposed</Badge><span>→</span><Badge variant="outline">pending</Badge><span>→</span><Badge variant="outline">running</Badge><span>→</span><Badge variant="outline">completed / crashed</Badge></div>
          <p>Claims are atomic. A graceful autoresearch shutdown should release its pending proposal; abandoned pending claims automatically return to proposed after the configured claim timeout. Starting a run moves its experiment to running, and finishing or crashing the run closes the experiment with the same outcome.</p>
          <p className="flex items-center gap-2"><GitBranch className="size-4" />Every run records the Git branch and commit used, so dashboard history can be traced back to branches such as <code className="rounded bg-muted px-1.5 py-0.5">autoresearch/Jul4</code>.</p>
        </DocSection>
      </article>
    </div>
  </main>
}
