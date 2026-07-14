"use client"

import { FormEvent, useEffect, useState } from "react"
import { FlaskConical } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { runtrace } from "@/lib/api"

const metricModes = ["curve", "timings", "scalar", "none"] as const

export function EditExperimentDialog({ slug, id, open, onOpenChange, onUpdated }: {
  slug: string
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}) {
  const [experiment, setExperiment] = useState<Awaited<ReturnType<typeof runtrace.experiment>> | null>(null)
  const [pending, setPending] = useState(false)
  const [title, setTitle] = useState("")
  const [hypothesis, setHypothesis] = useState("")
  const [reasoning, setReasoning] = useState("")
  const [details, setDetails] = useState("")
  const [metricMode, setMetricMode] = useState("curve")

  useEffect(() => {
    if (!open) return
    let active = true
    runtrace.experiment(slug, id).then((item) => {
      if (!active) return
      setExperiment(item)
      setTitle(item.title)
      setHypothesis(item.hypothesis)
      setReasoning(item.reasoning)
      setDetails(item.implementation_details)
      setMetricMode(item.metric_mode)
    }).catch((error) => {
      if (active) toast.error(error instanceof Error ? error.message : "Could not load experiment")
    })
    return () => { active = false }
  }, [id, open, slug])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await runtrace.updateExperiment(slug, id, {
        title,
        hypothesis,
        reasoning,
        implementation_details: details,
        metric_mode: metricMode,
      })
      toast.success("Experiment updated")
      onOpenChange(false)
      onUpdated()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update experiment")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) setExperiment(null)
      onOpenChange(nextOpen)
    }}>
      <DialogContent className="sm:max-w-xl">
        {experiment ? <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FlaskConical className="size-4 text-primary" />Edit {experiment.display_id}</DialogTitle>
            <DialogDescription>Update the proposal without changing its place in the shared experiment queue.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field><FieldLabel htmlFor="edit-experiment-title">Title</FieldLabel><Input id="edit-experiment-title" value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus /></Field>
            <Field><FieldLabel htmlFor="edit-hypothesis">Hypothesis</FieldLabel><Textarea id="edit-hypothesis" value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} required /></Field>
            <Field><FieldLabel htmlFor="edit-reasoning">Reasoning</FieldLabel><Textarea id="edit-reasoning" value={reasoning} onChange={(event) => setReasoning(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="edit-implementation">Implementation details</FieldLabel><Textarea id="edit-implementation" value={details} onChange={(event) => setDetails(event.target.value)} /></Field>
            <Field><FieldLabel>Result display</FieldLabel>
              <Select value={metricMode} onValueChange={(value) => setMetricMode(value ?? "curve")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{metricModes.map((value) => <SelectItem key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter><Button type="submit" disabled={pending || !title.trim() || !hypothesis.trim()}>{pending ? "Saving…" : "Save changes"}</Button></DialogFooter>
        </form> : <div className="py-8 text-center text-sm text-muted-foreground">Loading experiment…</div>}
      </DialogContent>
    </Dialog>
  )
}
