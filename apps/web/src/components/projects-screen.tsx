"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowRight, BookOpen, FolderKanban, Search } from "lucide-react"
import { toast } from "sonner"

import { AppSettingsDialog } from "@/components/app-settings-dialog"
import { AccountMenu } from "@/components/account-menu"
import { useAppearance } from "@/components/appearance-provider"
import { CreateProjectDialog } from "@/components/create-project-dialog"
import { RunTraceLogo } from "@/components/runtrace-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { runtrace } from "@/lib/api"
import type { Project } from "@/lib/types"
import { useAutoRefresh } from "@/lib/use-auto-refresh"
import { cn } from "@/lib/utils"
import { useI18n } from "@/components/i18n-provider"

export function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [query, setQuery] = useState("")
  const { compactRows } = useAppearance()
  const { locale, t } = useI18n()

  const load = useCallback(async () => {
    try {
      setProjects(await runtrace.projects())
    } catch {}
  }, [])

  useEffect(() => {
    runtrace.projects().then(setProjects).catch((error) => {
      toast.error(error instanceof Error ? error.message : t("Could not load projects"))
      setProjects([])
    })
  }, [t])
  useAutoRefresh(load)

  const filtered = useMemo(() => (projects ?? [])
    .filter((project) => `${project.name} ${project.slug} ${project.description}`.toLowerCase().includes(query.toLowerCase()))
    .toSorted((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()), [projects, query])

  const activeRuns = useMemo(() => (projects ?? []).reduce((total, project) => total + (project.active_runs ?? 0), 0), [projects])
  const experimentCount = useMemo(() => (projects ?? []).reduce((total, project) => total + (project.experiment_count ?? 0), 0), [projects])

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 sm:px-8">
      <header className="flex h-16 items-center justify-between border-b">
        <RunTraceLogo />
        <div className="flex items-center gap-1">
          <Button variant="ghost" render={<Link href="/docs" />} nativeButton={false}><BookOpen data-icon="inline-start" />{t("Docs")}</Button>
          <AppSettingsDialog />
          <AccountMenu />
        </div>
      </header>
      <section className="py-8 sm:py-12">
        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-2">
            <Badge variant="outline" className="w-fit">{t("Research registry")}</Badge>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("Pick up where the research left off.")}</h1>
            <p className="max-w-2xl text-muted-foreground">{t("Every project keeps experiments, agent decisions, metrics, and conclusions in one durable workspace.")}</p>
          </div>
          <CreateProjectDialog onCreated={(project) => setProjects((current) => [project, ...(current ?? [])])} />
        </div>

        {projects === null ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
        ) : projects.length === 0 ? (
          <Empty className="min-h-96 border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><FolderKanban /></EmptyMedia>
              <EmptyTitle>{t("No projects yet")}</EmptyTitle>
              <EmptyDescription>{t("Create your first registry, then connect an agent through the SDK, CLI, HTTP API, or MCP.")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent><CreateProjectDialog onCreated={(project) => setProjects([project])} /></EmptyContent>
          </Empty>
        ) : (
          <Card className="mb-8 sm:mb-12">
            <CardHeader>
              <CardTitle>{t("Your projects")}</CardTitle>
              <CardDescription>{projects.length} projects · {activeRuns} active runs · {experimentCount} experiment records</CardDescription>
              <CardAction>
                <InputGroup className="w-64 max-w-[42vw]">
                  <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search projects")} aria-label={t("Search projects")} />
                  <InputGroupAddon><Search /></InputGroupAddon>
                </InputGroup>
              </CardAction>
            </CardHeader>
            <CardContent className="pb-(--card-spacing)">
              {filtered.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((project) => (
                    <Link href={`/projects/${project.slug}`} key={project.id} className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <Card size="sm" className={cn("h-full transition-shadow group-hover:shadow-md", compactRows && "py-2")}>
                        <CardHeader>
                          <div className="mb-2 grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><FolderKanban aria-hidden="true" /></div>
                          <CardTitle className="flex items-center justify-between gap-3">
                            <span className="truncate">{project.name}</span>
                            <ArrowRight className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                          </CardTitle>
                          <CardDescription className="line-clamp-2 min-h-10">{project.description || t("No project goal yet")}</CardDescription>
                        </CardHeader>
                        <CardFooter className="mt-auto justify-between gap-3 text-xs text-muted-foreground">
                          <span><strong className="font-mono text-foreground">{project.active_runs ?? 0}</strong> {t("active")}</span>
                          <span><strong className="font-mono text-foreground">{project.experiment_count ?? 0}</strong> {t("records")}</span>
                          <span>{t("Updated")} {new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(project.updated_at))}</span>
                        </CardFooter>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty className="min-h-56">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Search /></EmptyMedia>
                    <EmptyTitle>{t("No matching projects")}</EmptyTitle>
                    <EmptyDescription>No project matches “{query}”.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        )}
      </section>
    </main>
  )
}
