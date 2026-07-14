"use client"

import type { Run } from "@/lib/types"

type CurvePoint = { value: number; step: number | null; timestamp: string }

function formatValue(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value)
}

function getPoints(run: Run | null, metric: string): CurvePoint[] {
  return run?.metrics?.[metric]?.points ?? []
}

function pathFor(points: CurvePoint[], x: (point: CurvePoint, index: number) => number, y: (value: number) => number) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point, index)} ${y(point.value)}`).join(" ")
}

export function RunCurveChart({ run, baseline, metric }: { run: Run; baseline: Run | null; metric: string }) {
  const runPoints = getPoints(run, metric)
  const baselinePoints = getPoints(baseline, metric)
  const points = [...runPoints, ...baselinePoints]

  if (!points.length) {
    return <div className="grid min-h-48 place-items-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">No {metric} curve was recorded for this run.</div>
  }

  const width = 940
  const height = 300
  const padLeft = 62
  const padRight = 22
  const padTop = 26
  const padBottom = 44
  const plotWidth = width - padLeft - padRight
  const plotHeight = height - padTop - padBottom
  const steps = points.map((point, index) => point.step ?? index)
  const maxStep = Math.max(1, ...steps)
  const values = points.map((point) => point.value)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const padding = (rawMax - rawMin || Math.max(Math.abs(rawMax), 1) * 0.08) * 0.08
  const min = rawMin - padding
  const max = rawMax + padding
  const span = max - min || 1
  const x = (point: CurvePoint, index: number) => padLeft + ((point.step ?? index) / maxStep) * plotWidth
  const y = (value: number) => padTop + ((max - value) / span) * plotHeight
  const runPath = pathFor(runPoints, x, y)
  const baselinePath = pathFor(baselinePoints, x, y)
  const tickSteps = Array.from({ length: 5 }, (_, index) => Math.round((maxStep * index) / 4))
  const lastRunPoint = runPoints.at(-1)
  const lastBaselinePoint = baselinePoints.at(-1)
  const finalDelta = lastRunPoint && lastBaselinePoint ? lastRunPoint.value - lastBaselinePoint.value : null

  return (
    <div className="overflow-x-auto" data-testid="run-curve-comparison">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-2 font-medium"><span className="size-2 rounded-full bg-primary" />{run.display_id} · {run.name}</span>
          {baseline && baseline.id !== run.id ? <span className="flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-full bg-muted-foreground" />Baseline · {baseline.display_id}</span> : null}
        </div>
        {finalDelta !== null ? <span className="font-mono text-muted-foreground">final Δ {finalDelta > 0 ? "+" : ""}{formatValue(finalDelta)}</span> : null}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="curve-title curve-description" className="min-w-[620px]">
        <title id="curve-title">{metric} curve compared with baseline</title>
        <desc id="curve-description">The selected run is shown in the accent color and the current baseline is shown in a muted dashed line.</desc>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = max - fraction * span
          return <g key={fraction}><line x1={padLeft} x2={width - padRight} y1={y(value)} y2={y(value)} className="stroke-border" /><text x={padLeft - 10} y={y(value) + 4} textAnchor="end" className="fill-muted-foreground text-[10px] font-mono">{formatValue(value)}</text></g>
        })}
        {tickSteps.map((step) => <g key={step}><line x1={padLeft + (step / maxStep) * plotWidth} x2={padLeft + (step / maxStep) * plotWidth} y1={padTop} y2={height - padBottom} className="stroke-border/60" strokeDasharray="3 5" /><text x={padLeft + (step / maxStep) * plotWidth} y={height - 14} textAnchor="middle" className="fill-muted-foreground text-[10px] font-mono">{step.toLocaleString()}</text></g>)}
        {baselinePath ? <path d={baselinePath} fill="none" className="stroke-muted-foreground" strokeWidth="2" strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {runPath ? <path d={runPath} fill="none" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {baseline?.id !== run.id ? baselinePoints.map((point, index) => <circle key={`baseline-${point.step ?? index}-${point.timestamp}`} cx={x(point, index)} cy={y(point.value)} r={point === lastBaselinePoint ? 4.5 : 3} className="fill-background stroke-muted-foreground" strokeWidth="2" />) : null}
        {runPoints.map((point, index) => <circle key={`run-${point.step ?? index}-${point.timestamp}`} cx={x(point, index)} cy={y(point.value)} r={point === lastRunPoint ? 5 : 3.5} className="fill-background stroke-primary" strokeWidth="2" />)}
      </svg>
      <p className="mt-1 text-center text-xs text-muted-foreground">step 0 – {maxStep.toLocaleString()} · {metric} · lower values are better</p>
    </div>
  )
}
