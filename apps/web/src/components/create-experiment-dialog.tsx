"use client"

import { FormEvent, useEffect, useState } from "react"
import { FlaskConical, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { runtrace } from "@/lib/api"
import type { ExperimentResultVisualizationType } from "@/lib/types"
import { useI18n } from "@/components/i18n-provider"

export function CreateExperimentDialog({ slug, onCreated }: { slug: string; onCreated: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [title, setTitle] = useState("")
  const [hypothesis, setHypothesis] = useState("")
  const [reasoning, setReasoning] = useState("")
  const [details, setDetails] = useState("")
  const [metricMode, setMetricMode] = useState("curve")
  const [resultTypes, setResultTypes] = useState<ExperimentResultVisualizationType[]>([])

  useEffect(() => {
    if (!open) return
    runtrace.resultVisualizationTypes(slug).then(setResultTypes).catch(() => undefined)
  }, [open, slug])

  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true)
    try {
      await runtrace.createExperiment(slug, { title, hypothesis, reasoning, implementation_details: details, metric_mode: metricMode, source: "human" })
      toast.success(t("Experiment added to the shared queue"))
      setOpen(false); setTitle(""); setHypothesis(""); setReasoning(""); setDetails(""); setMetricMode("curve")
      onCreated()
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Could not create experiment")) }
    finally { setPending(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}><Plus data-icon="inline-start" />{t("Propose experiment")}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FlaskConical className="size-4 text-primary" />{t("Propose an experiment")}</DialogTitle>
            <DialogDescription>{t("This adds work to the shared registry. It does not start or dispatch a worker.")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field><FieldLabel htmlFor="experiment-title">{t("Title")}</FieldLabel><Input id="experiment-title" value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus /></Field>
            <Field><FieldLabel htmlFor="hypothesis">{t("Hypothesis")}</FieldLabel><Textarea id="hypothesis" value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} required /></Field>
            <Field><FieldLabel htmlFor="reasoning">{t("Reasoning")}</FieldLabel><Textarea id="reasoning" value={reasoning} onChange={(event) => setReasoning(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="implementation">{t("Implementation details")}</FieldLabel><Textarea id="implementation" value={details} onChange={(event) => setDetails(event.target.value)} /></Field>
            <Field><FieldLabel>{t("Result display")}</FieldLabel>
              <Select value={metricMode} onValueChange={(value) => setMetricMode(value ?? "curve")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{(resultTypes.length ? resultTypes : [{ key: "curve", name: "Curve" }, { key: "timings", name: "Timings" }, { key: "scalar", name: "Scalar" }, { key: "bar", name: "Bar chart" }, { key: "none", name: "None" }]).map((item) => <SelectItem key={item.key} value={item.key}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter><Button type="submit" disabled={pending || !title.trim() || !hypothesis.trim()}>{pending ? t("Adding…") : t("Add to queue")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
