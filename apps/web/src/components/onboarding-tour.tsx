"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Clipboard, FolderKanban, LoaderCircle, Rocket, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { runtrace } from "@/lib/api"
import { auth } from "@/lib/auth"
import type { Project } from "@/lib/types"

type TourStep = "welcome" | "project" | "program" | "measurement" | "ready"

function toSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

function programTemplate(name: string, goal: string) {
  const objective = goal || `Improve ${name} through measured, reproducible experiments.`
  return `# ${name}\n\n## Objective\n${objective}\n\n## Success criteria\n- Improve the primary metric without regressing correctness or reliability.\n- Compare every result against the current baseline.\n- Record enough evidence for another agent to reproduce the result.\n\n## Experiment contract\n1. State a testable hypothesis before changing code.\n2. Change one meaningful variable at a time.\n3. Run the agreed evaluation and capture the primary metric.\n4. Keep changes only when the evidence supports the hypothesis.\n5. Record failures and discarded approaches so they are not repeated.\n\n## Boundaries\n- Preserve existing public behavior unless the experiment explicitly targets it.\n- Do not weaken tests, validation, or safety checks to improve the metric.\n- Prefer small, reviewable, reversible changes.\n`
}

const stepNumber: Partial<Record<TourStep, number>> = { project: 1, program: 2, measurement: 3, ready: 4 }

export function OnboardingTour({ onComplete }: { onComplete: () => Promise<void> }) {
  const router = useRouter()
  const [step, setStep] = useState<TourStep>("welcome")
  const [pending, setPending] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [goal, setGoal] = useState("")
  const [repositoryUrl, setRepositoryUrl] = useState("")
  const [program, setProgram] = useState("")
  const [metric, setMetric] = useState("validation_loss")
  const [direction, setDirection] = useState("lower_is_better")
  const [exclusions, setExclusions] = useState("Do not change the evaluation dataset\nDo not remove or weaken existing tests")

  async function finishOnboarding() {
    setPending(true)
    try {
      await auth.completeOnboarding()
      await onComplete()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save onboarding progress")
    } finally {
      setPending(false)
    }
  }

  async function createProject(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const created = await runtrace.createProject({
        name: name.trim(),
        slug: slug.trim(),
        description: goal.trim(),
        ...(repositoryUrl.trim() ? { repository_url: repositoryUrl.trim() } : {}),
      })
      setProject(created)
      setProgram(programTemplate(created.name, goal.trim()))
      setStep("program")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create project")
    } finally {
      setPending(false)
    }
  }

  async function saveProgram(event: FormEvent) {
    event.preventDefault()
    if (!project) return
    setPending(true)
    try {
      await runtrace.updateProgram(project.slug, program.trim())
      setStep("measurement")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save program.md")
    } finally {
      setPending(false)
    }
  }

  async function saveMeasurement(event: FormEvent) {
    event.preventDefault()
    if (!project) return
    setPending(true)
    try {
      const rules = exclusions.split("\n").map((rule) => rule.trim()).filter(Boolean)
      await Promise.all([
        runtrace.updateSettings(project.slug, metric.trim(), direction),
        runtrace.updateExclusions(project.slug, rules),
      ])
      setStep("ready")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save project settings")
    } finally {
      setPending(false)
    }
  }

  async function openProject() {
    if (!project) return
    setPending(true)
    try {
      await auth.completeOnboarding()
      await onComplete()
      router.push(`/projects/${project.slug}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not finish the tour")
      setPending(false)
    }
  }

  const numberedStep = stepNumber[step]
  const bootstrap = project ? `runtrace.get_project_context({ project: "${project.slug}" })` : ""

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        {numberedStep ? (
          <div className="flex items-center gap-2" aria-label={`Tour step ${numberedStep} of 4`}>
            {[1, 2, 3, 4].map((item) => <span key={item} className={`h-1.5 flex-1 rounded-full ${item <= numberedStep ? "bg-primary" : "bg-muted"}`} />)}
          </div>
        ) : null}

        {step === "welcome" ? <>
          <DialogHeader className="items-center px-4 pt-5 text-center">
            <div className="mb-2 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="size-7" /></div>
            <DialogTitle className="text-xl">Would you like a quick tour?</DialogTitle>
            <DialogDescription className="max-w-md leading-6">In a few minutes, we’ll create your first project, write its program.md, and configure the evidence agents should collect.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4 sm:grid-cols-3">
            {[[FolderKanban, "Create a project"], [Clipboard, "Define the program"], [Rocket, "Connect an agent"]].map(([Icon, label]) => {
              const ItemIcon = Icon as typeof FolderKanban
              return <div key={label as string} className="flex items-center gap-3 rounded-lg border p-3 sm:flex-col sm:py-4 sm:text-center"><ItemIcon className="size-5 text-primary" /><span className="text-sm font-medium">{label as string}</span></div>
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => void finishOnboarding()} disabled={pending}>Skip</Button>
            <Button onClick={() => setStep("project")} disabled={pending}>Yes, show me <ArrowRight data-icon="inline-end" /></Button>
          </DialogFooter>
        </> : null}

        {step === "project" ? <form onSubmit={createProject} className="contents">
          <DialogHeader><DialogTitle>Create your first project</DialogTitle><DialogDescription>A project is the durable workspace shared by your agents and your team.</DialogDescription></DialogHeader>
          <FieldGroup>
            <Field><FieldLabel htmlFor="tour-project-name">Project name</FieldLabel><Input id="tour-project-name" value={name} onChange={(event) => { const next = event.target.value; setName(next); if (!slug || slug === toSlug(name)) setSlug(toSlug(next)) }} placeholder="Dense optimizer" required autoFocus /></Field>
            <Field><FieldLabel htmlFor="tour-project-slug">Slug</FieldLabel><Input id="tour-project-slug" value={slug} onChange={(event) => setSlug(toSlug(event.target.value))} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /><FieldDescription>Used by the API, SDK, CLI, and MCP tools.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="tour-project-goal">Research goal</FieldLabel><Textarea id="tour-project-goal" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Reduce validation loss while preserving training stability." required /></Field>
            <Field><FieldLabel htmlFor="tour-repository-url">Repository URL <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="tour-repository-url" type="url" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/org/repo" /></Field>
          </FieldGroup>
          <DialogFooter><Button type="submit" disabled={pending || !name.trim() || !slug.trim() || !goal.trim()}>{pending ? <LoaderCircle className="animate-spin" /> : null} Create & continue <ArrowRight data-icon="inline-end" /></Button></DialogFooter>
        </form> : null}

        {step === "program" ? <form onSubmit={saveProgram} className="contents">
          <DialogHeader><DialogTitle>Define program.md</DialogTitle><DialogDescription>This versioned contract tells every agent what success means, how to evaluate work, and which boundaries to respect.</DialogDescription></DialogHeader>
          <Field><FieldLabel htmlFor="tour-program" className="sr-only">program.md</FieldLabel><Textarea id="tour-program" className="min-h-80 font-mono text-xs leading-6" value={program} onChange={(event) => setProgram(event.target.value)} required autoFocus /></Field>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setStep("project")}><ArrowLeft data-icon="inline-start" /> Back</Button><Button type="submit" disabled={pending || !program.trim()}>{pending ? <LoaderCircle className="animate-spin" /> : null} Save & continue <ArrowRight data-icon="inline-end" /></Button></DialogFooter>
        </form> : null}

        {step === "measurement" ? <form onSubmit={saveMeasurement} className="contents">
          <DialogHeader><DialogTitle>Choose evidence and boundaries</DialogTitle><DialogDescription>The primary metric powers progress comparisons. Exclusions prevent agents from retrying approaches you have ruled out.</DialogDescription></DialogHeader>
          <FieldGroup>
            <Field><FieldLabel htmlFor="tour-metric">Primary metric</FieldLabel><Input id="tour-metric" value={metric} onChange={(event) => setMetric(event.target.value)} placeholder="validation_loss" required autoFocus /><FieldDescription>Use the exact metric key your evaluation reports.</FieldDescription></Field>
            <Field><FieldLabel>Better result</FieldLabel><Select value={direction} onValueChange={(value) => value && setDirection(value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="lower_is_better">Lower is better</SelectItem><SelectItem value="higher_is_better">Higher is better</SelectItem></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="tour-exclusions">Exclusions</FieldLabel><Textarea id="tour-exclusions" className="min-h-28" value={exclusions} onChange={(event) => setExclusions(event.target.value)} /><FieldDescription>One rule per line. You can change these later in project settings.</FieldDescription></Field>
          </FieldGroup>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setStep("program")}><ArrowLeft data-icon="inline-start" /> Back</Button><Button type="submit" disabled={pending || !metric.trim()}>{pending ? <LoaderCircle className="animate-spin" /> : null} Save & continue <ArrowRight data-icon="inline-end" /></Button></DialogFooter>
        </form> : null}

        {step === "ready" ? <>
          <DialogHeader className="items-center px-4 pt-4 text-center"><div className="mb-2 grid size-14 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><Check className="size-7" /></div><DialogTitle className="text-xl">Your project is ready</DialogTitle><DialogDescription className="max-w-md leading-6">Bootstrap an agent with this call. It returns program.md, exclusions, the primary metric, baseline, proposals, and recent evidence together.</DialogDescription></DialogHeader>
          <div className="my-3 flex items-center gap-2 rounded-lg border bg-muted/50 p-3"><code className="min-w-0 flex-1 overflow-x-auto text-xs">{bootstrap}</code><Button type="button" size="icon-sm" variant="ghost" aria-label="Copy bootstrap call" onClick={() => { void navigator.clipboard.writeText(bootstrap); toast.success("Bootstrap call copied") }}><Clipboard /></Button></div>
          <DialogFooter><Button onClick={() => void openProject()} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Rocket data-icon="inline-start" />} Open {project?.name}</Button></DialogFooter>
        </> : null}
      </DialogContent>
    </Dialog>
  )
}
