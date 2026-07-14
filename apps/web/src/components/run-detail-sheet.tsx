"use client"

import { useEffect, useState } from "react"
import { FileJson, GitCommitHorizontal, ScrollText, Terminal } from "lucide-react"

import { ArtifactFiles, ArtifactUploadDialog, artifactKind } from "@/components/artifact-files"
import { RunCurveChart } from "@/components/run-curve-chart"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/status-badge"
import { runtrace } from "@/lib/api"
import type { Run } from "@/lib/types"

export function RunDetailSheet({ runId, baselineId, metric, onClose }: { runId: string | null; baselineId: string | null; metric: string; onClose: () => void }) {
  const [run, setRun] = useState<Run | null>(null)
  const [baselineRun, setBaselineRun] = useState<Run | null>(null)
  useEffect(() => {
    if (!runId) return
    let active = true
    const baselineRequest = baselineId && baselineId !== runId ? runtrace.run(baselineId) : Promise.resolve(null)
    Promise.all([runtrace.run(runId), baselineRequest]).then(([value, baseline]) => {
      if (!active) return
      setRun(value)
      setBaselineRun(baseline ?? (baselineId === value.id ? value : null))
    })
    return () => { active = false }
  }, [baselineId, runId])
  const visibleRun = run?.id === runId ? run : null
  function reload() {
    if (!runId) return
    const baselineRequest = baselineId && baselineId !== runId ? runtrace.run(baselineId) : Promise.resolve(null)
    Promise.all([runtrace.run(runId), baselineRequest]).then(([value, baseline]) => {
      setRun(value)
      setBaselineRun(baseline ?? (baselineId === value.id ? value : null))
    })
  }

  return (
    <Sheet open={Boolean(runId)} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {visibleRun ? (
          <div className="flex flex-col gap-7 p-5 sm:p-7">
            <SheetHeader className="p-0">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{visibleRun.display_id}</span><StatusBadge value={visibleRun.lifecycle} />{visibleRun.disposition !== "undecided" ? <StatusBadge value={visibleRun.disposition} /> : null}{visibleRun.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div>
              <SheetTitle className="text-xl">{visibleRun.name}</SheetTitle>
              <SheetDescription>{visibleRun.hypothesis || "No hypothesis recorded."}</SheetDescription>
            </SheetHeader>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
              <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Started</dt><dd className="mt-1 font-mono text-xs">{new Date(visibleRun.started_at).toLocaleString()}</dd></div>
              <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Branch</dt><dd className="mt-1 truncate font-mono text-xs">{visibleRun.git_branch || "—"}</dd></div>
              <div className="bg-background p-4"><dt className="text-xs text-muted-foreground">Commit</dt><dd className="mt-1 truncate font-mono text-xs">{visibleRun.git_commit?.slice(0, 10) || "—"}</dd></div>
            </dl>
            {visibleRun.reasoning ? <section><h3 className="mb-2 text-sm font-medium">Reasoning</h3><p className="text-sm leading-6 text-muted-foreground">{visibleRun.reasoning}</p></section> : null}
            {visibleRun.change_summary ? <section><h3 className="mb-2 text-sm font-medium">What changed</h3><p className="text-sm leading-6 text-muted-foreground">{visibleRun.change_summary}</p></section> : null}
            {visibleRun.metrics?.[metric]?.points.length ? <section className="rounded-xl border bg-background/60 p-4 sm:p-5"><div className="mb-3"><h3 className="text-sm font-medium">Loss curve vs baseline</h3><p className="mt-1 text-xs text-muted-foreground">Compare {metric} across the same step range.</p></div><RunCurveChart run={visibleRun} baseline={baselineRun} metric={metric} /></section> : null}
            {visibleRun.metrics && Object.keys(visibleRun.metrics).length ? <section><h3 className="mb-3 text-sm font-medium">Metrics</h3><div className="grid gap-3 sm:grid-cols-2">{Object.entries(visibleRun.metrics).map(([name, summary]) => <div key={name} className="rounded-lg border p-4"><span className="text-xs text-muted-foreground">{name}</span><strong className="mt-1 block font-mono text-xl">{summary.latest}</strong><small className="text-muted-foreground">{summary.count} points · {summary.min}–{summary.max}</small></div>)}</div></section> : null}
            {visibleRun.result_summary || visibleRun.conclusion ? <section className="rounded-lg border bg-muted/40 p-5"><h3 className="text-sm font-medium">Conclusion</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{visibleRun.conclusion || visibleRun.result_summary}</p></section> : null}
            {visibleRun.command ? <section><h3 className="mb-2 flex items-center gap-2 text-sm font-medium"><Terminal className="size-4" />Command</h3><pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs">{visibleRun.command}</pre></section> : null}
            {Object.keys(visibleRun.configuration).length || Object.keys(visibleRun.parameters || {}).length || visibleRun.artifacts?.some((artifact) => artifactKind(artifact) === "config") ? <section><h3 className="mb-3 flex items-center gap-2 text-sm font-medium"><FileJson className="size-4" />Configuration</h3>{Object.keys(visibleRun.configuration).length || Object.keys(visibleRun.parameters || {}).length ? <pre className="mb-3 max-h-72 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-5">{JSON.stringify({ configuration: visibleRun.configuration, parameters: visibleRun.parameters || {} }, null, 2)}</pre> : null}<ArtifactFiles artifacts={(visibleRun.artifacts || []).filter((artifact) => artifactKind(artifact) === "config")} /></section> : null}
            {visibleRun.events?.length || visibleRun.artifacts?.some((artifact) => artifactKind(artifact) === "log") ? <section><h3 className="mb-3 flex items-center gap-2 text-sm font-medium"><ScrollText className="size-4" />Logs & events</h3>{visibleRun.events?.length ? <div className="mb-3 flex max-h-72 flex-col gap-3 overflow-auto rounded-lg border p-4">{visibleRun.events.map((event) => <div key={event.id} className="grid grid-cols-[auto_1fr] gap-3 text-xs"><time className="font-mono text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString()}</time><span><span className="mr-2 font-mono text-muted-foreground">{event.level}</span>{event.message}</span></div>)}</div> : null}<ArtifactFiles artifacts={(visibleRun.artifacts || []).filter((artifact) => artifactKind(artifact) === "log")} /></section> : null}
            <section><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-medium">Artifacts</h3><ArtifactUploadDialog runId={visibleRun.id} onUploaded={reload} /></div>{visibleRun.artifacts?.some((artifact) => artifactKind(artifact) === "artifact") ? <ArtifactFiles artifacts={visibleRun.artifacts.filter((artifact) => artifactKind(artifact) === "artifact")} /> : <p className="text-sm text-muted-foreground">No general artifacts saved.</p>}</section>
            {visibleRun.git_commit ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><GitCommitHorizontal className="size-4" />{visibleRun.git_commit}</p> : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-6"><SheetHeader><SheetTitle>Run details</SheetTitle><SheetDescription>Loading run evidence.</SheetDescription></SheetHeader><Skeleton className="h-24" /><Skeleton className="h-52" /></div>
        )}
      </SheetContent>
    </Sheet>
  )
}
