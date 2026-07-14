import Link from "next/link"
import { ArrowLeft, BookOpen, Braces, Radio, Search, Terminal } from "lucide-react"

import { RunTraceLogo } from "@/components/runtrace-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const snippets = [
  {
    title: "Retrieve agent context",
    description: "Start every agent session with current constraints and evidence.",
    icon: Braces,
    code: `runtrace context <project-slug>\n\n# MCP\nruntrace.get_project_context({ project: "<project-slug>" })`,
  },
  {
    title: "Search prior experiments",
    description: "Hybrid BGE embeddings and keyword retrieval stay project-scoped.",
    icon: Search,
    code: `runtrace search <project-slug> "what was tried before?"\n\nPOST /api/v1/search\n{ "project": "<project-slug>", "query": "..." }`,
  },
  {
    title: "Track a command",
    description: "Wrap any language or benchmark and emit structured metrics.",
    icon: Terminal,
    code: `runtrace exec --project <project-slug> \\\n  --name "benchmark variation" \\\n  --hypothesis "this should improve latency" -- \\\n  ./benchmark`,
  },
  {
    title: "Subscribe to a run",
    description: "Metrics, events, and terminal status stream over SSE.",
    icon: Radio,
    code: `const stream = new EventSource(\n  "/api/v1/runs/<run-id>/stream"\n)\nstream.addEventListener("metric", console.log)`,
  },
]

export default function DocsPage() {
  return <main className="mx-auto min-h-screen w-full max-w-6xl px-5 sm:px-8">
    <header className="flex h-20 items-center justify-between border-b"><RunTraceLogo /><Button variant="ghost" render={<Link href="/" />} nativeButton={false}><ArrowLeft data-icon="inline-start" />Projects</Button></header>
    <section className="py-12 sm:py-16">
      <div className="mb-10 max-w-3xl"><Badge variant="secondary"><BookOpen />Workspace docs</Badge><h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Connect people and agents to the same experiment memory.</h1><p className="mt-4 text-base leading-7 text-muted-foreground">RunTrace exposes the same project-scoped registry through its dashboard, HTTP API, Python SDK, CLI, and MCP server.</p></div>
      <div className="grid gap-5 md:grid-cols-2">{snippets.map(({ title, description, icon: Icon, code }) => <Card key={title}><CardHeader><CardTitle className="flex items-center gap-2"><Icon className="size-4 text-primary" />{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 font-mono text-xs leading-6">{code}</pre></CardContent></Card>)}</div>
      <Card className="mt-8"><CardHeader><CardTitle>Interactive HTTP reference</CardTitle><CardDescription>FastAPI publishes an OpenAPI document and a complete interactive request console.</CardDescription></CardHeader><CardContent><Button render={<a href="/api/docs" target="_blank" rel="noreferrer" />}><BookOpen data-icon="inline-start" />Open API docs</Button></CardContent></Card>
    </section>
  </main>
}
