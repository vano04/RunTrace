"use client"

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Activity, Archive, ArrowDownUp, Copy, Database, FileText, FlaskConical, Plus, Save, Search, ShieldCheck, Tags, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { CreateExperimentDialog } from "@/components/create-experiment-dialog"
import { ProgressChart } from "@/components/progress-chart"
import { ProjectVisualizationWidgets, VisualizationSettings } from "@/components/project-visualizations"
import { ProjectShell } from "@/components/project-shell"
import { ProjectAccessCard } from "@/components/project-access-card"
import { RecordActions } from "@/components/record-actions"
import { RecordDetailDialog, type RecordSelection } from "@/components/record-detail-dialog"
import { StatusBadge } from "@/components/status-badge"
import { TagFilter } from "@/components/tag-filter"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { runtrace } from "@/lib/api"
import type { Dashboard, ProgressData, Run, SearchResult } from "@/lib/types"
import { useAutoRefresh } from "@/lib/use-auto-refresh"

export type ProjectView = "dashboard" | "search" | "archive" | "settings"

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—"
}

function latestMetric(run: Run, preferred: string) {
  const metrics = run.metrics ?? {}
  const entry = metrics[preferred] ?? Object.values(metrics)[0]
  return entry ? String(entry.latest) : "—"
}

function PageHeading({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><h1 className="text-3xl font-semibold tracking-tight">{title}</h1>{description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}</div>{actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}</div>
}

function DashboardView({ data, progress, slug, reload, setProgress, openRecord, onProgressQueryChange }: {
  data: Dashboard; progress: ProgressData; slug: string; reload: () => void; setProgress: (value: ProgressData) => void; openRecord: (selection: NonNullable<RecordSelection>) => void; onProgressQueryChange: (value: { metric: string; window: string; includeTags: string[]; excludeTags: string[] }) => void
}) {
  const [metric, setMetric] = useState(progress.metric)
  const [window, setWindow] = useState(progress.window)
  const [includeTags, setIncludeTags] = useState<string[]>([])
  const [excludeTags, setExcludeTags] = useState<string[]>([])
  const queue = useMemo(() => [...data.active_runs, ...data.experiments.filter((item) => ["proposed", "pending", "running"].includes(item.lifecycle))], [data])
  const metricOptions = useMemo(() => Array.from(new Set([data.project.progress_metric_key, ...data.available_metrics])).map((value) => ({ label: value, value })), [data])
  const windowOptions = [
    { label: "24 hours", value: "1d" },
    { label: "7 days", value: "7d" },
    { label: "30 days", value: "30d" },
    { label: "90 days", value: "90d" },
    { label: "All time", value: "all" },
  ]

  async function changeProgress(nextMetric: string, nextWindow: string, nextInclude = includeTags, nextExclude = excludeTags) {
    setMetric(nextMetric); setWindow(nextWindow)
    onProgressQueryChange({ metric: nextMetric, window: nextWindow, includeTags: nextInclude, excludeTags: nextExclude })
    try { setProgress(await runtrace.progress(slug, nextMetric, nextWindow, nextInclude, nextExclude)) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not load progress") }
  }

  return <>
    <PageHeading title="Dashboard" description={data.project.description || "Add a durable research goal in Settings so every agent starts from the same objective."} actions={<CreateExperimentDialog slug={slug} onCreated={reload} />} />
    <Card className="mb-6 overflow-hidden py-0">
      <CardHeader className="flex flex-col gap-4 border-b py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><CardTitle>Autoresearch progress</CardTitle><CardDescription>Strict best-so-far improvement over the first completed run in this window.</CardDescription></div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <TagFilter tags={data.available_tags} include={includeTags} exclude={excludeTags} onChange={(nextInclude, nextExclude) => { setIncludeTags(nextInclude); setExcludeTags(nextExclude); changeProgress(metric, window, nextInclude, nextExclude) }} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select items={metricOptions} value={metric} onValueChange={(value) => value && changeProgress(String(value), window)}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{metricOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
            <Select items={windowOptions} value={window} onValueChange={(value) => value && changeProgress(metric, String(value))}><SelectTrigger className="w-[118px]"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{windowOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6"><ProgressChart data={progress} /></CardContent>
    </Card>

    <ProjectVisualizationWidgets visualizations={data.visualizations} />

    <Card className="mb-8 py-0">
      <CardContent className="grid p-0 sm:grid-cols-[1.4fr_.65fr_.65fr_auto]">
        <div className="border-b p-5 sm:border-b-0 sm:border-r"><span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Current main baseline</span>{data.baseline ? <button className="mt-2 block text-left" onClick={() => openRecord({ kind: "run", id: data.baseline!.id })}><strong className="text-base">{data.baseline.display_id} · {data.baseline.name}</strong><span className="mt-1 block text-xs text-muted-foreground">Established {formatDate(data.baseline.finished_at)}</span></button> : <p className="mt-2 text-sm text-muted-foreground">No completed baseline yet.</p>}</div>
        <div className="border-r p-5"><span className="text-xs text-muted-foreground">Primary metric</span><strong className="mt-2 block font-mono text-lg">{data.baseline ? latestMetric(data.baseline, data.project.progress_metric_key) : "—"}</strong></div>
        <div className="p-5"><span className="text-xs text-muted-foreground">Connected workers</span><strong className="mt-2 block font-mono text-lg">{data.worker_count}</strong></div>
        <div className="flex items-center border-t px-5 py-4 sm:border-l sm:border-t-0"><Badge variant="secondary"><Database />Shared registry</Badge></div>
      </CardContent>
    </Card>

    <section className="mb-10">
      <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-lg font-semibold">Shared experiment queue</h2><p className="mt-1 text-sm text-muted-foreground">Workers claim proposals independently from this registry.</p></div><div className="flex flex-wrap gap-4 text-xs text-muted-foreground">{["proposed", "pending", "running", "kept", "discarded", "crashed"].map((value) => <span key={value} className="flex items-center gap-1.5"><span className={`status-dot status-${value}`} />{value} {data.counts[value] ?? 0}</span>)}</div></div>
      {queue.length ? <div className="overflow-hidden rounded-lg border"><Table><TableHeader><TableRow><TableHead className="w-28">ID</TableHead><TableHead>Status</TableHead><TableHead>Experiment</TableHead><TableHead className="hidden lg:table-cell">Branch</TableHead><TableHead className="hidden md:table-cell">Created</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{queue.map((item) => {
        const isRun = "change_summary" in item
        const branch = isRun ? item.git_branch : item.claimed_by
        return <TableRow key={`${isRun ? "run" : "experiment"}-${item.id}`} className="cursor-pointer" onClick={() => openRecord({ kind: isRun ? "run" : "experiment", id: item.id })}><TableCell className="font-mono text-xs">{item.display_id}</TableCell><TableCell><StatusBadge value={item.lifecycle} /></TableCell><TableCell><strong className="block max-w-lg truncate text-sm font-medium">{isRun ? item.name : item.title}</strong><span className="mt-1 block max-w-lg truncate text-xs text-muted-foreground">{item.hypothesis}</span></TableCell><TableCell className="hidden lg:table-cell"><code className="text-xs text-muted-foreground">{branch || "Not claimed"}</code></TableCell><TableCell className="hidden text-xs text-muted-foreground md:table-cell">{formatDate(isRun ? item.started_at : item.created_at)}</TableCell><TableCell onClick={(event) => event.stopPropagation()}><RecordActions slug={slug} id={item.id} type={isRun ? "run" : "experiment"} onChanged={reload} /></TableCell></TableRow>
      })}</TableBody></Table></div> : <Empty className="min-h-56 border"><EmptyHeader><EmptyMedia variant="icon"><FlaskConical /></EmptyMedia><EmptyTitle>The queue is empty</EmptyTitle><EmptyDescription>Propose an experiment here or let a planning agent add one through MCP.</EmptyDescription></EmptyHeader></Empty>}
    </section>

    <section className="flex h-[calc(100dvh-2.5rem)] min-h-[32rem] flex-col">
      <div className="mb-4"><h2 className="text-lg font-semibold">Recent completed experiments</h2><p className="mt-1 text-sm text-muted-foreground">Durable evidence available to future agents.</p></div>
      {data.history.length ? <ScrollArea className="min-h-0 flex-1 overflow-hidden rounded-xl ring-1 ring-foreground/10 [&_[data-slot=table-container]]:overflow-visible [&>[data-slot=scroll-area-scrollbar]]:!top-10 [&>[data-slot=scroll-area-scrollbar]]:h-[calc(100%-2.5rem)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow><TableHead>Run</TableHead><TableHead className="hidden lg:table-cell">Branch</TableHead><TableHead className="hidden md:table-cell">Finished</TableHead><TableHead>Result</TableHead><TableHead>Disposition</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{data.history.map((run) => <TableRow key={run.id} className="cursor-pointer" onClick={() => openRecord({ kind: "run", id: run.id })}><TableCell><span className="font-mono text-xs text-muted-foreground">{run.display_id}</span><strong className="mt-1 block max-w-sm truncate text-sm">{run.name}</strong></TableCell><TableCell className="hidden lg:table-cell"><code className="text-xs text-muted-foreground">{run.git_branch || "—"}</code></TableCell><TableCell className="hidden text-xs text-muted-foreground md:table-cell">{formatDate(run.finished_at)}</TableCell><TableCell className="max-w-xs truncate font-mono text-xs">{run.result_summary || latestMetric(run, data.project.progress_metric_key)}</TableCell><TableCell><StatusBadge value={run.lifecycle === "crashed" ? "crashed" : run.disposition} /></TableCell><TableCell onClick={(event) => event.stopPropagation()}><RecordActions slug={slug} id={run.id} type="run" canBaseline={run.lifecycle === "completed"} onChanged={reload} /></TableCell></TableRow>)}</TableBody></Table></ScrollArea> : <Empty className="min-h-48 flex-1 border"><EmptyHeader><EmptyMedia variant="icon"><Activity /></EmptyMedia><EmptyTitle>No completed runs</EmptyTitle><EmptyDescription>Tracked runs will appear here after an agent finishes or crashes them.</EmptyDescription></EmptyHeader></Empty>}
    </section>
  </>
}

const SEARCH_ORDERS = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Lowest metric", value: "metric-low" },
  { label: "Highest metric", value: "metric-high" },
  { label: "Best match", value: "relevance" },
]

type SearchOrder = typeof SEARCH_ORDERS[number]["value"]

function SearchView({ data, slug, reload, openRecord }: { data: Dashboard; slug: string; reload: () => void; openRecord: (selection: NonNullable<RecordSelection>) => void }) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [pending, setPending] = useState(true)
  const [includeTags, setIncludeTags] = useState<string[]>([])
  const [excludeTags, setExcludeTags] = useState<string[]>([])
  const [order, setOrder] = useState<SearchOrder>("newest")
  useEffect(() => {
    let active = true
    runtrace.search(slug, "").then((response) => {
      if (active) { setResults(response.results); setSearched(true) }
    }).catch((error) => {
      if (active) toast.error(error instanceof Error ? error.message : "Could not load experiment evidence")
    }).finally(() => { if (active) setPending(false) })
    return () => { active = false }
  }, [slug])
  async function runSearch(nextInclude = includeTags, nextExclude = excludeTags) { setPending(true); try { const response = await runtrace.search(slug, query, false, nextInclude, nextExclude); setResults(response.results); setSearched(true) } catch (error) { toast.error(error instanceof Error ? error.message : "Search failed") } finally { setPending(false) } }
  async function submit(event: FormEvent) { event.preventDefault(); await runSearch() }
  function filtersChanged(nextInclude: string[], nextExclude: string[]) { setIncludeTags(nextInclude); setExcludeTags(nextExclude); if (searched) runSearch(nextInclude, nextExclude) }
  function recordChanged() { reload(); runSearch() }
  const orderedResults = useMemo(() => results.toSorted((left, right) => {
    const newest = new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
    if (order === "newest") return newest
    if (order === "oldest") return -newest
    if (order === "relevance") return right.score - left.score || newest
    const leftMetric = left.metric_value
    const rightMetric = right.metric_value
    if (leftMetric == null && rightMetric == null) return newest
    if (leftMetric == null) return 1
    if (rightMetric == null) return -1
    return order === "metric-low" ? leftMetric - rightMetric || newest : rightMetric - leftMetric || newest
  }), [order, results])
  return <div className="flex h-[calc(100dvh-7.5rem)] min-h-[32rem] flex-col lg:h-[calc(100dvh-5rem)]"><PageHeading title="Search" description={`Semantic and keyword retrieval across ${data.project.name} experiments, reasoning, configurations, outcomes, and conclusions.`} />
    <form onSubmit={submit} className="mb-4 flex flex-col gap-2 sm:flex-row">
      <InputGroup className="h-10 flex-1">
        <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What has already been tried?" aria-label="Search experiment evidence" />
        <InputGroupAddon><Search /></InputGroupAddon>
        <InputGroupAddon align="inline-end"><InputGroupButton type="submit" variant="default" disabled={pending}>{pending ? "Searching…" : "Search"}</InputGroupButton></InputGroupAddon>
      </InputGroup>
      <Select items={SEARCH_ORDERS} value={order} onValueChange={(value) => value && setOrder(String(value) as SearchOrder)}>
        <SelectTrigger className="h-10 w-full sm:w-44" aria-label="Order search results"><ArrowDownUp /><SelectValue /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}><SelectGroup>{SEARCH_ORDERS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
    </form>
    <div className="mb-6"><TagFilter tags={data.available_tags} include={includeTags} exclude={excludeTags} onChange={filtersChanged} /></div>
    {searched && !results.length ? <Empty className="min-h-64 border"><EmptyHeader><EmptyMedia variant="icon"><Search /></EmptyMedia><EmptyTitle>No matching evidence</EmptyTitle><EmptyDescription>Try a broader description, metric name, or implementation detail.</EmptyDescription></EmptyHeader></Empty> : null}
    {orderedResults.length ? <Card className="min-h-0 flex-1 gap-0 py-0"><CardHeader className="border-b py-4"><CardTitle>Experiment evidence</CardTitle><CardDescription>{orderedResults.length} records · ordered {SEARCH_ORDERS.find((item) => item.value === order)?.label.toLowerCase()}</CardDescription></CardHeader><ScrollArea className="min-h-0 flex-1"><CardContent className="divide-y p-0">{orderedResults.map((result) => <div key={`${result.kind}-${result.id}`} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto]"><button type="button" onClick={() => openRecord({ kind: result.kind, id: result.id })} className="min-w-0 text-left"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{result.display_id}</span><Badge variant="secondary">{result.kind}</Badge>{result.match_type ? <Badge variant="outline">{result.match_type}</Badge> : null}{result.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div><h2 className="mt-2 font-medium">{result.title}</h2><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{result.conclusion || result.result_summary || result.hypothesis}</p><p className="mt-2 text-xs text-muted-foreground">{formatDate(result.timestamp)}{result.metric_value == null ? "" : ` · ${data.project.progress_metric_key}: ${result.metric_value}`}</p></button><div className="flex items-start gap-2"><StatusBadge value={result.lifecycle === "completed" ? result.disposition : result.lifecycle} /><RecordActions slug={slug} id={result.id} type={result.kind} archived={result.archived} canBaseline={result.kind === "run" && result.lifecycle === "completed"} onChanged={recordChanged} /></div></div>)}</CardContent></ScrollArea></Card> : null}
  </div>
}

function ArchiveView({ data, slug, reload, openRecord }: { data: Dashboard; slug: string; reload: () => void; openRecord: (selection: NonNullable<RecordSelection>) => void }) {
  return <><PageHeading title="Archive" description="Archived records are excluded from active dashboards, claims, ordinary search, and default agent context." />
    {data.archived.length ? <div className="divide-y border-y">{data.archived.map((item) => { const isRun = "change_summary" in item; return <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-5 py-5"><button className="text-left" onClick={() => openRecord({ kind: isRun ? "run" : "experiment", id: item.id })}><span className="font-mono text-xs text-muted-foreground">{item.display_id}</span><strong className="mt-1 block text-sm">{isRun ? item.name : item.title}</strong><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.hypothesis}</p></button><RecordActions slug={slug} id={item.id} type={isRun ? "run" : "experiment"} archived onChanged={reload} /></div> })}</div> : <Empty className="min-h-72 border"><EmptyHeader><EmptyMedia variant="icon"><Archive /></EmptyMedia><EmptyTitle>Nothing is archived</EmptyTitle><EmptyDescription>Archived experiments and runs remain restorable and auditable.</EmptyDescription></EmptyHeader></Empty>}
  </>
}

function SettingsView({ data, slug, reload }: { data: Dashboard; slug: string; reload: () => void }) {
  const router = useRouter()
  const [description, setDescription] = useState(data.project.description)
  const [repositoryUrl, setRepositoryUrl] = useState(data.project.repository_url ?? "")
  const [program, setProgram] = useState(data.program.content)
  const [exclusions, setExclusions] = useState(data.exclusions.join("\n"))
  const [metric, setMetric] = useState(data.project.progress_metric_key)
  const [direction, setDirection] = useState(data.project.progress_metric_direction)
  const [pending, setPending] = useState(false)
  const [tagNames, setTagNames] = useState<Record<string, string>>(() => Object.fromEntries(data.tag_definitions.map((tag) => [tag.id, tag.name])))
  const [newTag, setNewTag] = useState("")
  const [tagPending, setTagPending] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  async function save(event: FormEvent) { event.preventDefault(); setPending(true); try { await Promise.all([runtrace.updateProject(slug, description, repositoryUrl), runtrace.updateProgram(slug, program), runtrace.updateExclusions(slug, exclusions.split("\n")), runtrace.updateSettings(slug, metric, direction)]); toast.success("Project settings saved"); reload() } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save settings") } finally { setPending(false) } }
  async function addTag() { const name = newTag.trim(); if (!name) return; setTagPending("new"); try { await runtrace.createTag(slug, name); setNewTag(""); toast.success("Filter created"); reload() } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create filter") } finally { setTagPending(null) } }
  async function renameTag(id: string) { const name = tagNames[id]?.trim(); if (!name) return; setTagPending(id); try { await runtrace.updateTag(slug, id, name); toast.success("Filter updated"); reload() } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update filter") } finally { setTagPending(null) } }
  async function removeTag(id: string, name: string) { if (!window.confirm(`Delete “${name}”? It will also be removed from existing runs and experiments.`)) return; setTagPending(id); try { await runtrace.deleteTag(slug, id); toast.success("Filter deleted"); reload() } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete filter") } finally { setTagPending(null) } }
  async function deleteProject() { setDeleting(true); try { await runtrace.deleteProject(slug); toast.success("Project deleted"); router.replace("/") } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete project"); setDeleting(false) } }
  const bootstrap = `runtrace.get_project_context({ project: "${slug}" })`
  return <form onSubmit={save}><PageHeading title="Settings" description="Durable research context returned to every agent that bootstraps this project." actions={<Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>} />
    <div className="flex flex-col gap-6">
      <Card><CardHeader><CardTitle>Project goal</CardTitle><CardDescription>Shown on the dashboard and used to orient human supervisors.</CardDescription></CardHeader><CardContent><Field><FieldLabel htmlFor="goal">Goal</FieldLabel><Textarea id="goal" value={description} onChange={(event) => setDescription(event.target.value)} /></Field></CardContent></Card>
      <Card><CardHeader><CardTitle>Project repository</CardTitle><CardDescription>Source repository associated with this project.</CardDescription></CardHeader><CardContent><Field><FieldLabel htmlFor="repository-url">Repository URL</FieldLabel><Input id="repository-url" type="url" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/org/repo" /><FieldDescription>Set during project creation or update it here.</FieldDescription></Field></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-4" />program.md <Badge variant="secondary">v{data.program.version}</Badge></CardTitle><CardDescription>The objective, evaluation contract, implementation boundaries, and evidence required to keep a change.</CardDescription></CardHeader><CardContent><Field><FieldLabel htmlFor="program" className="sr-only">program.md</FieldLabel><Textarea id="program" className="min-h-72 font-mono text-xs leading-6" value={program} onChange={(event) => setProgram(event.target.value)} /></Field></CardContent></Card>
      <Card id="exclusions"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" />Research exclusions</CardTitle><CardDescription>One durable constraint per line. These guide agents but do not control workers.</CardDescription></CardHeader><CardContent><Field><FieldLabel htmlFor="exclusions" className="sr-only">Research exclusions</FieldLabel><Textarea id="exclusions" className="min-h-32 font-mono text-xs leading-6" value={exclusions} onChange={(event) => setExclusions(event.target.value)} placeholder="Do not use…" /></Field></CardContent></Card>
      <Card><CardHeader><CardTitle>Progress metric</CardTitle><CardDescription>Use the exact metric name emitted by the SDK or agent.</CardDescription></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor="metric">Metric name</FieldLabel><Input id="metric" className="font-mono" value={metric} onChange={(event) => setMetric(event.target.value)} list="available-metrics" /><datalist id="available-metrics">{data.available_metrics.map((value) => <option value={value} key={value} />)}</datalist></Field><Field><FieldLabel>Direction</FieldLabel><Select value={direction} onValueChange={(value) => value && setDirection(String(value) as typeof direction)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="lower_is_better">Lower is better</SelectItem><SelectItem value="higher_is_better">Higher is better</SelectItem></SelectGroup></SelectContent></Select></Field></FieldGroup></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Tags className="size-4" />Filters</CardTitle><CardDescription>Register tags used by dashboards, search, the HTTP API, and MCP. Rule-backed filters keep their behavior when renamed.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="flex max-w-md gap-2"><Input value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="Tag name" aria-label="New tag name" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag() } }} /><Button type="button" variant="secondary" onClick={addTag} disabled={!newTag.trim() || tagPending === "new"}><Plus />Add</Button></div>
        <div className="divide-y rounded-lg border">{data.tag_definitions.map((tag) => <div key={tag.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"><div className="w-full sm:w-72"><Input value={tagNames[tag.id] ?? tag.name} onChange={(event) => setTagNames((current) => ({ ...current, [tag.id]: event.target.value }))} aria-label={`Tag name ${tag.name}`} /><p className="mt-1 text-xs text-muted-foreground">{tag.rule_key ? "Automatically assigned from autoresearch run data" : "Registered tag"}</p></div><div className="flex gap-2 sm:ml-auto"><Button type="button" size="sm" variant="outline" disabled={tagPending === tag.id || !tagNames[tag.id]?.trim() || tagNames[tag.id]?.trim() === tag.name} onClick={() => renameTag(tag.id)}><Save />Save</Button><Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${tag.name}`} disabled={tagPending === tag.id} onClick={() => removeTag(tag.id, tag.name)}><Trash2 /></Button></div></div>)}</div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Agent bootstrap</CardTitle><CardDescription>Retrieve program.md, exclusions, baseline, metric definitions, proposals, and recent evidence in one call.</CardDescription></CardHeader><CardContent><div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3"><code className="min-w-0 flex-1 truncate text-xs">{bootstrap}</code><Button type="button" size="icon-sm" variant="ghost" aria-label="Copy bootstrap call" onClick={() => { navigator.clipboard.writeText(bootstrap); toast.success("Copied") }}><Copy /></Button></div><FieldDescription className="mt-3">Registry endpoint: {data.project.registry_endpoint}</FieldDescription></CardContent></Card>
      <Card><CardHeader><CardTitle>Experiment result displays</CardTitle><CardDescription>Reusable per-run result types, separate from dashboard tracking widgets. Agents can add RTVis types through the result visualization MCP tools.</CardDescription></CardHeader><CardContent><div className="divide-y rounded-lg border">{data.result_visualization_types.map((item) => <div key={item.key} className="flex items-start justify-between gap-4 p-4"><div><strong className="text-sm font-medium">{item.name}</strong><p className="mt-1 text-xs text-muted-foreground">{item.description}</p></div><Badge variant={item.builtin ? "outline" : "secondary"}>{item.builtin ? "Built in" : item.key}</Badge></div>)}</div></CardContent></Card>
      <VisualizationSettings slug={slug} visualizations={data.visualizations} reload={reload} />
      <ProjectAccessCard project={slug} />
      <Card className="border-destructive/40"><CardHeader><CardTitle className="text-destructive">Delete project</CardTitle><CardDescription>Permanently removes this project, its proposals, runs, metrics, events, and uploaded artifacts.</CardDescription></CardHeader><CardContent><AlertDialog><AlertDialogTrigger render={<Button type="button" variant="destructive" />}>Delete {data.project.name}</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {data.project.name}?</AlertDialogTitle><AlertDialogDescription>This cannot be undone. All experiment history and artifacts in this project will be permanently removed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={deleting} onClick={deleteProject}>{deleting ? "Deleting…" : "Delete project"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></CardContent></Card>
    </div>
  </form>
}

export function ProjectWorkspace({ slug, view }: { slug: string; view: ProjectView }) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<RecordSelection>(null)
  const closeRecord = useCallback(() => setSelectedRecord(null), [])
  const loadedRef = useRef(false)
  const progressQuery = useRef({ metric: "", window: "all", includeTags: [] as string[], excludeTags: [] as string[] })
  const load = useCallback(async () => {
    const query = progressQuery.current
    try { const [dashboard, progressData] = await Promise.all([runtrace.dashboard(slug), runtrace.progress(slug, query.metric, query.window, query.includeTags, query.excludeTags)]); loadedRef.current = true; setData(dashboard); setProgress(progressData); setError(null) }
    catch (caught) { if (!loadedRef.current) setError(caught instanceof Error ? caught.message : "Could not load project") }
  }, [slug])
  useEffect(() => {
    let active = true
    Promise.all([runtrace.dashboard(slug), runtrace.progress(slug)]).then(([dashboard, progressData]) => {
      if (!active) return
      loadedRef.current = true; setData(dashboard); setProgress(progressData); setError(null)
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "Could not load project")
    })
    return () => { active = false }
  }, [slug])
  useAutoRefresh(load)

  if (error) return <main className="grid min-h-screen place-items-center p-6"><Empty className="max-w-lg border"><EmptyHeader><EmptyMedia variant="icon"><Database /></EmptyMedia><EmptyTitle>RunTrace API unavailable</EmptyTitle><EmptyDescription>{error}</EmptyDescription></EmptyHeader><Button onClick={load}>Try again</Button></Empty></main>
  if (!data || !progress) return <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]"><div className="hidden border-r bg-sidebar lg:block" /><main className="mx-auto w-full max-w-[1240px] p-8"><Skeleton className="h-10 w-64" /><Skeleton className="mt-8 h-80" /><Skeleton className="mt-6 h-36" /></main></div>
  return <ProjectShell project={data.project}>
    {view === "dashboard" ? <DashboardView data={data} progress={progress} slug={slug} reload={load} setProgress={setProgress} openRecord={setSelectedRecord} onProgressQueryChange={(value) => { progressQuery.current = value }} /> : null}
    {view === "search" ? <SearchView data={data} slug={slug} reload={load} openRecord={setSelectedRecord} /> : null}
    {view === "archive" ? <ArchiveView data={data} slug={slug} reload={load} openRecord={setSelectedRecord} /> : null}
    {view === "settings" ? <SettingsView key={data.project.updated_at + data.program.version} data={data} slug={slug} reload={load} /> : null}
    <RecordDetailDialog selection={selectedRecord} slug={slug} baselineId={data?.baseline?.id ?? null} metric={data?.project.progress_metric_key ?? "validation_loss"} onClose={closeRecord} />
  </ProjectShell>
}
