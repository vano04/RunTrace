"use client"

import { useEffect, useMemo, useState, type KeyboardEvent } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { RTVisNode, Visualization } from "@/lib/types"

type Row = Record<string, unknown>

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
const THEME_TOKENS = ["background", "foreground", "card", "card-foreground", "muted", "muted-foreground", "border", "primary", "primary-foreground", "destructive", "radius", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const

function readField(row: Row, path: string | null | undefined): unknown {
  if (!path) return undefined
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Row)[key] : undefined, row)
}

function displayValue(value: unknown, format: "text" | "number" | "date" = "text") {
  if (value === null || value === undefined || value === "") return "—"
  if (format === "number" && typeof value === "number") return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value)
  if (format === "date" && (typeof value === "string" || typeof value === "number")) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
  }
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function metricValue(node: RTVisNode, rows: Row[]) {
  if (node.value !== null && node.value !== undefined) return displayValue(node.value, typeof node.value === "number" ? "number" : "text")
  const values = rows.map((row) => readField(row, node.field)).filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  if (node.aggregate === "count") return new Intl.NumberFormat().format(rows.length)
  if (!values.length) return "—"
  const value = node.aggregate === "first" ? values[0]
    : node.aggregate === "min" ? Math.min(...values)
      : node.aggregate === "max" ? Math.max(...values)
        : node.aggregate === "avg" ? values.reduce((sum, item) => sum + item, 0) / values.length
          : node.aggregate === "sum" ? values.reduce((sum, item) => sum + item, 0)
            : values.at(-1)
  return displayValue(value, "number")
}

function VisualizationChart({ node, rows }: { node: RTVisNode; rows: Row[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const width = 880, height = 280, left = 54, right = 42, top = 24, bottom = 46
  const points = rows.map((row, index) => ({
    row,
    index,
    xLabel: displayValue(readField(row, node.x)),
    y: Number(readField(row, node.y)),
    series: displayValue(readField(row, node.series)) === "—" ? "Value" : displayValue(readField(row, node.series)),
  })).filter((point) => Number.isFinite(point.y))
  if (!points.length) return <p className="py-12 text-center text-sm text-muted-foreground">No numeric data is available for this chart.</p>

  if (node.chart === "heatmap") {
    const xValues = Array.from(new Set(points.map((point) => point.xLabel)))
    const seriesValues = Array.from(new Set(points.map((point) => point.series)))
    const min = Math.min(...points.map((point) => point.y)), max = Math.max(...points.map((point) => point.y)), span = max - min || 1
    const cellWidth = (width - left - right) / Math.max(xValues.length, 1)
    const cellHeight = (height - top - bottom) / Math.max(seriesValues.length, 1)
    return <div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px]" role="img" aria-label={`${node.title || "Heatmap"}. ${points.length} values from ${min} to ${max}.`}>
      {points.map((point) => {
        const x = left + xValues.indexOf(point.xLabel) * cellWidth, y = top + seriesValues.indexOf(point.series) * cellHeight
        return <rect key={`${point.index}-${point.series}`} x={x + 1} y={y + 1} width={Math.max(1, cellWidth - 2)} height={Math.max(1, cellHeight - 2)} rx="4" fill={`color-mix(in oklch, var(--primary) ${20 + ((point.y - min) / span) * 75}%, var(--muted))`}><title>{point.xLabel} · {point.series}: {point.y}</title></rect>
      })}
      {xValues.map((value, index) => <text key={value} x={left + (index + .5) * cellWidth} y={height - 18} textAnchor="middle" className="fill-muted-foreground text-[10px]">{value}</text>)}
      {seriesValues.map((value, index) => <text key={value} x={left - 8} y={top + (index + .5) * cellHeight + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{value}</text>)}
    </svg></div>
  }

  const groups = Array.from(new Set(points.map((point) => point.series)))
  const yMin = Math.min(0, ...points.map((point) => point.y)), yMax = Math.max(0, ...points.map((point) => point.y)), ySpan = yMax - yMin || 1
  const plotWidth = width - left - right
  const xFor = (index: number) => node.chart === "bar"
    ? left + ((index + .5) / points.length) * plotWidth
    : left + (points.length === 1 ? .5 : index / (points.length - 1)) * plotWidth
  const yFor = (value: number) => top + (yMax - value) / ySpan * (height - top - bottom)
  const paths = groups.map((group) => ({ group, points: points.filter((point) => point.series === group) }))
  const barWidth = Math.max(3, plotWidth / Math.max(points.length, 1) * .7)
  const activeIndex = hovered ?? pinned
  const activePoint = activeIndex === null ? null : points.find((point) => point.index === activeIndex) ?? null
  const activeX = activePoint ? xFor(points.indexOf(activePoint)) : 0
  const activeY = activePoint ? yFor(activePoint.y) : 0
  const detailWidth = 190, detailHeight = 70, detailGap = 14
  const detailX = activeX + detailWidth + detailGap <= width - right ? activeX + detailGap : activeX - detailWidth - detailGap
  const detailY = Math.min(height - bottom - detailHeight, Math.max(4, activeY - detailHeight / 2))
  const pointEvents = (index: number) => ({
    onMouseEnter: () => setHovered(index), onMouseLeave: () => setHovered(null),
    onFocus: () => setHovered(index), onBlur: () => setHovered(null),
    onClick: () => setPinned(pinned === index ? null : index),
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPinned(pinned === index ? null : index) } },
  })

  return <div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px]" role="img" aria-label={`${node.title || node.chart || "Chart"}. ${points.length} plotted values.`}>
    {[0, .25, .5, .75, 1].map((fraction) => {
      const value = yMax - ySpan * fraction, y = yFor(value)
      return <g key={fraction}><line x1={left} x2={width - right} y1={y} y2={y} className="stroke-border" /><text x={left - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{displayValue(value, "number")}</text></g>
    })}
    {node.chart === "bar" ? points.map((point, index) => {
      const y = yFor(Math.max(0, point.y)), zero = yFor(0)
      return <g key={point.index} role="button" tabIndex={0} aria-label={`${point.xLabel}: ${point.y}`} className="cursor-pointer outline-none" {...pointEvents(point.index)}><rect x={xFor(index) - barWidth / 2} y={Math.min(y, zero)} width={barWidth} height={Math.max(1, Math.abs(zero - yFor(point.y)))} rx="3" fill={SERIES_COLORS[groups.indexOf(point.series) % SERIES_COLORS.length]} opacity={activeIndex === point.index ? 1 : .82} /></g>
    }) : paths.map(({ group, points: seriesPoints }, groupIndex) => {
      const coordinates = seriesPoints.map((point) => ({ ...point, x: xFor(points.indexOf(point)), py: yFor(point.y) }))
      const path = coordinates.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.py}`).join(" ")
      const area = `${path} L ${coordinates.at(-1)?.x} ${yFor(0)} L ${coordinates[0]?.x} ${yFor(0)} Z`
      return <g key={group}>{node.chart === "area" ? <path d={area} fill={SERIES_COLORS[groupIndex % SERIES_COLORS.length]} opacity="0.18" /> : null}{node.chart !== "scatter" ? <path d={path} fill="none" stroke={SERIES_COLORS[groupIndex % SERIES_COLORS.length]} strokeWidth="2.5" strokeLinejoin="round" /> : null}{coordinates.map((point) => <g key={point.index} role="button" tabIndex={0} aria-label={`${point.xLabel}: ${point.y}`} className="cursor-pointer outline-none" {...pointEvents(point.index)}><circle cx={point.x} cy={point.py} r="11" fill="transparent" /><circle cx={point.x} cy={point.py} r={activeIndex === point.index ? 6 : 4} fill="var(--background)" stroke={SERIES_COLORS[groupIndex % SERIES_COLORS.length]} strokeWidth="2" /></g>)}</g>
    })}
    {points.filter((_, index) => index % Math.max(1, Math.ceil(points.length / 8)) === 0 || index === points.length - 1).map((point) => <text key={`label-${point.index}`} x={xFor(points.indexOf(point))} y={height - 18} textAnchor="middle" className="fill-muted-foreground text-[10px]">{point.xLabel}</text>)}
    {activePoint ? <foreignObject x={detailX} y={detailY} width={detailWidth} height={detailHeight} className="pointer-events-none overflow-visible"><div className="rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg"><div className="truncate font-medium">{activePoint.xLabel}</div><div className="mt-2 flex justify-between gap-3"><span className="text-muted-foreground">{activePoint.series}</span><strong className="font-mono">{displayValue(activePoint.y, "number")}</strong></div></div></foreignObject> : null}
  </svg><p className="mt-1 text-center text-xs text-muted-foreground">hover or focus for details · click to pin</p>{groups.length > 1 ? <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">{groups.map((group, index) => <span key={group} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />{group}</span>)}</div> : null}</div>
}

function widgetDocument(node: RTVisNode, datasets: Record<string, Row[]>, theme: Record<string, string>) {
  const payload = JSON.stringify({ datasets, theme, markup: node.markup ?? "", styles: node.styles ?? "", script: node.script ?? "" }).replaceAll("<", "\\u003c")
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; frame-src 'none';"><style>
:root{${Object.entries(theme).map(([key, value]) => `--${key}:${value};`).join("")}color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:transparent;color:var(--foreground);font-size:14px}body{padding:1px}button,input,select,textarea{font:inherit}.card{border:1px solid var(--border);border-radius:var(--radius,12px);background:var(--card);color:var(--card-foreground);padding:16px}.btn{display:inline-flex;min-height:36px;align-items:center;justify-content:center;gap:8px;border:1px solid var(--border);border-radius:calc(var(--radius,12px) - 4px);background:var(--background);color:var(--foreground);padding:7px 12px;cursor:pointer}.btn:hover{background:var(--muted)}.btn-primary{border-color:var(--primary);background:var(--primary);color:var(--primary-foreground)}.badge{display:inline-flex;align-items:center;border-radius:999px;background:var(--muted);color:var(--muted-foreground);padding:3px 8px;font-size:12px;font-weight:500}.input,.select{min-height:36px;width:100%;border:1px solid var(--border);border-radius:calc(var(--radius,12px) - 4px);background:var(--background);color:var(--foreground);padding:7px 10px}.muted{color:var(--muted-foreground)}.grid{display:grid;gap:16px}.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:560px){.grid-2{grid-template-columns:1fr}}
</style><style id="widget-styles"></style></head><body><div id="widget-root"></div><script>
const payload=${payload};window.runtrace={datasets:payload.datasets,theme:payload.theme};document.getElementById("widget-styles").textContent=payload.styles;document.getElementById("widget-root").innerHTML=payload.markup;window.addEventListener("error",event=>{const root=document.getElementById("widget-root");root.innerHTML='<div class="card"><strong>Widget error</strong><p class="muted"></p></div>';root.querySelector("p").textContent=event.message;});const script=document.createElement("script");script.textContent=payload.script;document.body.appendChild(script);
</script></body></html>`
}

function JavaScriptWidget({ node, datasets }: { node: RTVisNode; datasets: Record<string, Row[]> }) {
  const [theme, setTheme] = useState<Record<string, string>>({})
  useEffect(() => {
    const root = document.documentElement
    const readTheme = () => {
      const computed = getComputedStyle(root)
      setTheme(Object.fromEntries(THEME_TOKENS.map((token) => [token, computed.getPropertyValue(`--${token}`).trim()])))
    }
    readTheme()
    const observer = new MutationObserver(readTheme)
    observer.observe(root, { attributes: true, attributeFilter: ["class", "style"] })
    return () => observer.disconnect()
  }, [])
  const srcDoc = useMemo(() => widgetDocument(node, datasets, theme), [datasets, node, theme])
  return <iframe title={node.title || "Custom visualization"} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={srcDoc} className="w-full border-0 bg-transparent" style={{ height: node.height ?? 360 }} />
}

function NodeView({ node, datasets }: { node: RTVisNode; datasets: Record<string, Row[]> }) {
  const children = node.children ?? []
  const rows = node.dataset ? datasets[node.dataset] ?? [] : []
  if (node.type === "stack") return <div className="flex flex-col gap-4">{children.map((child, index) => <NodeView key={index} node={child} datasets={datasets} />)}</div>
  if (node.type === "grid") return <div className={cn("grid gap-4", node.columns_count === 1 ? "grid-cols-1" : node.columns_count === 3 ? "md:grid-cols-3" : node.columns_count === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2")}>{children.map((child, index) => <NodeView key={index} node={child} datasets={datasets} />)}</div>
  if (node.type === "card") return <Card><CardHeader><CardTitle>{node.title}</CardTitle>{node.description ? <CardDescription>{node.description}</CardDescription> : null}</CardHeader><CardContent><div className="flex flex-col gap-4">{children.map((child, index) => <NodeView key={index} node={child} datasets={datasets} />)}</div></CardContent></Card>
  if (node.type === "metric") return <div className="min-w-0"><p className="text-sm text-muted-foreground">{node.label || node.title}</p><strong className="mt-1 block font-mono text-2xl font-medium">{metricValue(node, rows)}</strong>{node.description ? <p className="mt-1 text-sm text-muted-foreground">{node.description}</p> : null}</div>
  if (node.type === "badge") return <div><Badge variant="secondary">{node.label}</Badge></div>
  if (node.type === "text") return <p className="text-sm leading-6 text-muted-foreground">{node.content}</p>
  if (node.type === "separator") return <Separator />
  if (node.type === "table") return <div className="overflow-hidden rounded-lg border"><Table><TableHeader><TableRow>{node.columns?.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.slice(0, 100).map((row, index) => <TableRow key={index}>{node.columns?.map((column) => <TableCell key={column.key}>{displayValue(readField(row, column.key), column.format)}</TableCell>)}</TableRow>)}</TableBody></Table></div>
  if (node.type === "chart") return <div>{node.title ? <div className="mb-3"><h3 className="font-medium">{node.title}</h3>{node.description ? <p className="mt-1 text-sm text-muted-foreground">{node.description}</p> : null}</div> : null}<VisualizationChart node={node} rows={rows} /></div>
  if (node.type === "javascript") return <JavaScriptWidget node={node} datasets={datasets} />
  return null
}

export function VisualizationRenderer({ visualization }: { visualization: Pick<Visualization, "spec" | "resolved_datasets"> }) {
  const datasets = useMemo(() => visualization.resolved_datasets ?? {}, [visualization.resolved_datasets])
  return <NodeView node={visualization.spec.view} datasets={datasets} />
}
