"use client"

import { useEffect, useRef, useState } from "react"
import { Activity, FileJson, GitCommitHorizontal, GitPullRequest, ScrollText, Terminal } from "lucide-react"
import { toast } from "sonner"

import { ArtifactFiles, ArtifactUploadDialog, artifactKind } from "@/components/artifact-files"
import { RunCurveChart } from "@/components/run-curve-chart"
import { VisualizationRenderer } from "@/components/visualization-renderer"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { runtrace } from "@/lib/api"
import type { Experiment, Run } from "@/lib/types"

export type RecordSelection = { kind: "experiment" | "run"; id: string } | null

type StreamMetric = { id: number; name: string; value: number; step: number | null; timestamp: string }
type StreamEvent = { id: number; message: string; level: string; event_type: string | null; timestamp: string }

function appendMetric(run: Run, point: StreamMetric): Run {
  const current = run.metrics?.[point.name]
  if (current?.points.some((item) => item.id === point.id)) return run
  const points = [...(current?.points ?? []), { id: point.id, value: point.value, step: point.step, timestamp: point.timestamp }]
    .sort((left, right) => (left.step ?? 0) - (right.step ?? 0) || left.timestamp.localeCompare(right.timestamp))
  const values = points.map((item) => item.value)
  return {
    ...run,
    metrics: {
      ...run.metrics,
      [point.name]: {
        latest: points.at(-1)?.value ?? point.value,
        min: Math.min(...values),
        max: Math.max(...values),
        count: points.length,
        points,
      },
    },
  }
}

function appendEvent(run: Run, event: StreamEvent): Run {
  if (run.events?.some((item) => item.id === event.id)) return run
  return { ...run, events: [...(run.events ?? []), event] }
}

function ImplementationDetails({ value }: { value: string }) {
  const match = value.match(/([\s\S]*?)```diff\n([\s\S]*?)```([\s\S]*)/)
  if (!match) return <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{value}</p>
  const [, before, diff, after] = match
  return <div className="space-y-3">
    {before.trim() ? <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{before.trim()}</p> : null}
    <div className="overflow-hidden rounded-lg border bg-zinc-950 text-zinc-100"><div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-xs text-zinc-400"><GitPullRequest className="size-3.5" />Proposed code diff</div><pre className="overflow-x-auto p-4 font-mono text-xs leading-5">{diff.trim().split("\n").map((line, index) => <span key={`${index}-${line}`} className={`block ${line.startsWith("+") && !line.startsWith("+++") ? "bg-emerald-500/15 text-emerald-200" : line.startsWith("-") && !line.startsWith("---") ? "bg-red-500/15 text-red-200" : line.startsWith("@@") ? "text-sky-300" : ""}`}>{line}</span>)}</pre></div>
    {after.trim() ? <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{after.trim()}</p> : null}
  </div>
}

function ExperimentDetails({ experiment }: { experiment: Experiment }) {
  return <div className="flex flex-col gap-7 p-5 sm:p-7">
    <DialogHeader className="pr-10">
      <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{experiment.display_id}</span><Badge variant="secondary">experiment</Badge><StatusBadge value={experiment.lifecycle} /></div>
      <DialogTitle className="text-xl leading-tight">{experiment.title}</DialogTitle>
      <DialogDescription>{experiment.hypothesis || "No hypothesis recorded."}</DialogDescription>
    </DialogHeader>
    <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
      <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Source</dt><dd className="mt-1 truncate text-sm">{experiment.source || "—"}</dd></div>
      <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Model</dt><dd className="mt-1 truncate text-sm">{experiment.source_model || "—"}</dd></div>
      <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Implementation branch</dt><dd className="mt-1 truncate font-mono text-xs">{experiment.claimed_by || "Not claimed"}</dd></div>
      <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Metric mode</dt><dd className="mt-1 font-mono text-sm">{experiment.metric_mode}</dd></div>
    </dl>
    {experiment.reasoning ? <section><h3 className="mb-2 text-sm font-medium">Reasoning</h3><p className="text-sm leading-6 text-muted-foreground">{experiment.reasoning}</p></section> : null}
    {experiment.implementation_details ? <section><h3 className="mb-2 text-sm font-medium">Implementation details</h3><ImplementationDetails value={experiment.implementation_details} /></section> : null}
    <section><h3 className="mb-3 flex items-center gap-2 text-sm font-medium"><FileJson className="size-4" />Configuration</h3>{Object.keys(experiment.configuration).length ? <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-5">{JSON.stringify(experiment.configuration, null, 2)}</pre> : <p className="text-sm text-muted-foreground">No configuration recorded.</p>}</section>
  </div>
}

function RunDetails({ run, baselineRun, metric, reload }: { run: Run; baselineRun: Run | null; metric: string; reload: () => void }) {
  const metricEntries = Object.entries(run.metrics ?? {})
  const curveMetric = run.metrics?.[metric] ? metric : metricEntries[0]?.[0]
  return <div className="flex flex-col gap-7 p-5 sm:p-7">
    <DialogHeader className="pr-10">
      <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{run.display_id}</span><Badge variant="secondary">run</Badge><StatusBadge value={run.lifecycle} />{run.lifecycle === "running" ? <Badge variant="outline" className="animate-pulse"><Activity />Live updates</Badge> : null}{run.disposition !== "undecided" ? <StatusBadge value={run.disposition} /> : null}{run.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div>
      <DialogTitle className="text-xl leading-tight">{run.name}</DialogTitle>
      <DialogDescription>{run.hypothesis || "No hypothesis recorded."}</DialogDescription>
    </DialogHeader>
    <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
      <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Started</dt><dd className="mt-1 font-mono text-xs">{new Date(run.started_at).toLocaleString()}</dd></div>
      <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Run branch</dt><dd className="mt-1 truncate font-mono text-xs">{run.git_branch || "—"}</dd></div>
      <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Commit</dt><dd className="mt-1 truncate font-mono text-xs">{run.git_commit?.slice(0, 10) || "—"}</dd></div>
    </dl>
    {run.reasoning ? <section><h3 className="mb-2 text-sm font-medium">Reasoning</h3><p className="text-sm leading-6 text-muted-foreground">{run.reasoning}</p></section> : null}
    {run.change_summary ? <section><h3 className="mb-2 text-sm font-medium">What changed</h3><p className="text-sm leading-6 text-muted-foreground">{run.change_summary}</p></section> : null}
    {run.metric_mode === "curve" && curveMetric && run.metrics?.[curveMetric]?.points.length ? <section className="rounded-xl border bg-background/60 p-4 sm:p-5"><div className="mb-3"><h3 className="text-sm font-medium">{curveMetric} vs baseline</h3><p className="mt-1 text-xs text-muted-foreground">{run.lifecycle === "running" ? "New points appear here live as they are logged." : `Every recorded ${curveMetric} point across the shared step range.`}</p></div><RunCurveChart run={run} baseline={baselineRun} metric={curveMetric} /></section> : null}
    {run.result_visualization ? <section><div className="mb-3"><h3 className="text-sm font-medium">{run.result_visualization.name}</h3><p className="mt-1 text-xs text-muted-foreground">{run.result_visualization.description || "Experiment-specific result visualization."}</p></div><VisualizationRenderer visualization={run.result_visualization} /></section> : null}
    {metricEntries.length ? <section><h3 className="mb-3 text-sm font-medium">{run.metric_mode === "timings" ? "Timing results" : "Metrics"}</h3><div className="grid gap-3 sm:grid-cols-2">{metricEntries.map(([name, summary]) => <div key={name} className="rounded-lg border p-5"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{name.replaceAll("_", " ")}</span><strong className={`mt-2 block font-mono ${run.metric_mode === "timings" || run.metric_mode === "scalar" ? "text-4xl tracking-tight" : "text-2xl"}`}>{summary.latest}</strong><small className="mt-2 block text-muted-foreground">{summary.count} {summary.count === 1 ? "point" : "points"} · range {summary.min}–{summary.max}</small></div>)}</div></section> : null}
    {run.result_summary || run.conclusion ? <section className="rounded-lg border bg-muted/40 p-5"><h3 className="text-sm font-medium">Conclusion</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{run.conclusion || run.result_summary}</p></section> : null}
    {run.command ? <section><h3 className="mb-2 flex items-center gap-2 text-sm font-medium"><Terminal className="size-4" />Command</h3><pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs">{run.command}</pre></section> : null}
    {Object.keys(run.configuration).length || Object.keys(run.parameters || {}).length || run.artifacts?.some((artifact) => artifactKind(artifact) === "config") ? <section><h3 className="mb-3 flex items-center gap-2 text-sm font-medium"><FileJson className="size-4" />Configuration</h3>{Object.keys(run.configuration).length || Object.keys(run.parameters || {}).length ? <pre className="mb-3 max-h-72 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-5">{JSON.stringify({ configuration: run.configuration, parameters: run.parameters || {} }, null, 2)}</pre> : null}<ArtifactFiles artifacts={(run.artifacts || []).filter((artifact) => artifactKind(artifact) === "config")} /></section> : null}
    {run.events?.length || run.artifacts?.some((artifact) => artifactKind(artifact) === "log") ? <section><h3 className="mb-3 flex items-center gap-2 text-sm font-medium"><ScrollText className="size-4" />Logs & events</h3>{run.events?.length ? <div className="mb-3 flex max-h-72 flex-col gap-3 overflow-auto rounded-lg border p-4">{run.events.map((event) => <div key={event.id} className="grid grid-cols-[auto_1fr] gap-3 text-xs"><time className="font-mono text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString()}</time><span><span className="mr-2 font-mono text-muted-foreground">{event.level}</span>{event.message}</span></div>)}</div> : null}<ArtifactFiles artifacts={(run.artifacts || []).filter((artifact) => artifactKind(artifact) === "log")} /></section> : null}
    <section><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-medium">Artifacts</h3><ArtifactUploadDialog runId={run.id} onUploaded={reload} /></div>{run.artifacts?.some((artifact) => artifactKind(artifact) === "artifact") ? <ArtifactFiles artifacts={run.artifacts.filter((artifact) => artifactKind(artifact) === "artifact")} /> : <p className="text-sm text-muted-foreground">No general artifacts saved.</p>}</section>
    {run.git_commit ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><GitCommitHorizontal className="size-4" />{run.git_commit}</p> : null}
  </div>
}

export function RecordDetailDialog({ selection, slug, baselineId, metric, onClose }: { selection: RecordSelection; slug: string; baselineId: string | null; metric: string; onClose: () => void }) {
  const [record, setRecord] = useState<Experiment | Run | null>(null)
  const [baselineRun, setBaselineRun] = useState<Run | null>(null)
  const recordRef = useRef<Experiment | Run | null>(null)
  const selectedRunning = Boolean(record && "change_summary" in record && record.lifecycle === "running")

  useEffect(() => {
    recordRef.current = record
  }, [record])

  useEffect(() => {
    if (!selection) return
    let active = true
    const recordRequest = selection.kind === "run" ? runtrace.run(selection.id) : runtrace.experiment(slug, selection.id)
    const baselineRequest = selection.kind === "run" && baselineId && baselineId !== selection.id ? runtrace.run(baselineId) : Promise.resolve(null)
    Promise.all([recordRequest, baselineRequest]).then(([value, baseline]) => {
      if (!active) return
      setRecord(value)
      setBaselineRun(baseline ?? (selection.kind === "run" && baselineId === value.id ? value as Run : null))
    }).catch((error) => {
      if (active) { toast.error(error instanceof Error ? error.message : "Could not load record details"); onClose() }
    })
    return () => { active = false }
  }, [baselineId, onClose, selection, slug])

  useEffect(() => {
    if (!selection || selection.kind !== "run" || !selectedRunning) return
    const refresh = () => runtrace.run(selection.id).then(setRecord).catch(() => undefined)
    const current = recordRef.current as Run | null
    const metricIds = Object.values(current?.metrics ?? {}).flatMap((series) => series.points.map((point) => point.id))
    const eventIds = current?.events?.map((event) => event.id) ?? []
    const params = new URLSearchParams({
      after_metric_id: String(Math.max(0, ...metricIds)),
      after_event_id: String(Math.max(0, ...eventIds)),
    })
    const source = new EventSource(`/api/v1/runs/${selection.id}/stream?${params}`)
    source.addEventListener("metric", (event) => {
      const point = JSON.parse((event as MessageEvent).data) as StreamMetric
      setRecord((value) => value && "change_summary" in value ? appendMetric(value, point) : value)
    })
    source.addEventListener("event", (event) => {
      const item = JSON.parse((event as MessageEvent).data) as StreamEvent
      setRecord((value) => value && "change_summary" in value ? appendEvent(value, item) : value)
    })
    source.addEventListener("status", (event) => {
      const status = JSON.parse((event as MessageEvent).data) as Pick<Run, "lifecycle" | "disposition">
      setRecord((value) => value && "change_summary" in value ? { ...value, ...status } : value)
      if (status.lifecycle !== "running") void refresh()
    })
    source.onerror = () => { void refresh() }
    const interval = window.setInterval(refresh, 15_000)
    return () => {
      window.clearInterval(interval)
      source.close()
    }
  }, [selectedRunning, selection, slug])

  function reloadRun() {
    if (!selection || selection.kind !== "run") return
    runtrace.run(selection.id).then(setRecord).catch((error) => toast.error(error instanceof Error ? error.message : "Could not refresh run details"))
  }

  const visibleRecord = record?.id === selection?.id ? record : null
  const isRun = visibleRecord && "change_summary" in visibleRecord

  return <Dialog open={Boolean(selection)} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-[min(94vw,1100px)]">
      {visibleRecord ? (isRun ? <RunDetails run={visibleRecord} baselineRun={baselineRun} metric={metric} reload={reloadRun} /> : <ExperimentDetails experiment={visibleRecord} />) : <div className="flex flex-col gap-4 p-6"><DialogHeader><DialogTitle>Experiment details</DialogTitle><DialogDescription>Loading recorded evidence.</DialogDescription></DialogHeader><Skeleton className="h-24" /><Skeleton className="h-64" /></div>}
    </DialogContent>
  </Dialog>
}
