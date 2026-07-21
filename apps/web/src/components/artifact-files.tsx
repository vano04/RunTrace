"use client"

import { FormEvent, useState } from "react"
import { Download, Eye, FilePlus2, FileText } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { runtrace } from "@/lib/api"
import type { Artifact } from "@/lib/types"
import { useI18n } from "@/components/i18n-provider"

const textSuffixes = [".cfg", ".conf", ".csv", ".env", ".ini", ".json", ".jsonl", ".log", ".md", ".out", ".stderr", ".stdout", ".toml", ".txt", ".yaml", ".yml"]

export function artifactKind(artifact: Artifact): "log" | "config" | "artifact" {
  const kind = artifact.metadata?.kind
  if (kind === "log" || kind === "config") return kind
  const name = artifact.name.toLowerCase()
  if ([".log", ".out", ".stderr", ".stdout"].some((suffix) => name.endsWith(suffix))) return "log"
  if ([".cfg", ".conf", ".env", ".ini", ".json", ".toml", ".yaml", ".yml"].some((suffix) => name.endsWith(suffix))) return "config"
  return "artifact"
}

function canPreview(artifact: Artifact) {
  const name = artifact.name.toLowerCase()
  return artifact.content_type.startsWith("text/") || ["application/json", "application/x-yaml", "application/xml"].includes(artifact.content_type) || textSuffixes.some((suffix) => name.endsWith(suffix))
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function ArtifactFiles({ artifacts }: { artifacts: Artifact[] }) {
  const { t } = useI18n()
  const [selected, setSelected] = useState<Artifact | null>(null)
  const [preview, setPreview] = useState<{ content: string; truncated: boolean } | null>(null)
  const [pending, setPending] = useState(false)

  async function openPreview(artifact: Artifact) {
    setSelected(artifact); setPreview(null); setPending(true)
    try { setPreview(await runtrace.previewArtifact(artifact.id)) }
    catch (error) { toast.error(error instanceof Error ? error.message : t("Could not preview artifact")); setSelected(null) }
    finally { setPending(false) }
  }

  return <>
    <div className="flex flex-col gap-2">{artifacts.map((artifact) => <div key={artifact.id} className="flex items-center gap-2 rounded-lg border p-2">
      <FileText className="ml-1 size-4 shrink-0 text-muted-foreground" />
      <button type="button" disabled={!canPreview(artifact)} onClick={() => openPreview(artifact)} className="min-w-0 flex-1 text-left disabled:cursor-default"><span className="block truncate text-sm font-medium">{artifact.name}</span><span className="text-xs text-muted-foreground">{formatSize(artifact.size)} · {artifact.content_type}</span></button>
      {canPreview(artifact) ? <Button type="button" variant="ghost" size="icon-sm" aria-label={`Preview ${artifact.name}`} onClick={() => openPreview(artifact)}><Eye /></Button> : null}
      <Button variant="ghost" size="icon-sm" aria-label={`Download ${artifact.name}`} render={<a href={`/api/v1/artifacts/${artifact.id}/download`} download />}><Download /></Button>
    </div>)}</div>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader><DialogTitle>{selected?.name || t("Artifact preview")}</DialogTitle><DialogDescription>{selected?.content_type} · {t("Preview limited to 500 KB")}</DialogDescription></DialogHeader>
        {pending ? <Skeleton className="h-80" /> : <pre className="max-h-[65vh] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs leading-5 whitespace-pre-wrap">{preview?.content}</pre>}
        {preview?.truncated ? <p className="text-xs text-muted-foreground">{t("Preview truncated. Download the file to inspect the remainder.")}</p> : null}
        <DialogFooter showCloseButton>{selected ? <Button variant="outline" render={<a href={`/api/v1/artifacts/${selected.id}/download`} download />}><Download data-icon="inline-start" />{t("Download")}</Button> : null}</DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}

export function ArtifactUploadDialog({ runId, onUploaded }: { runId: string; onUploaded: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState("artifact")
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setPending(true)
    try { await runtrace.uploadArtifact(runId, file, kind); toast.success(t("Artifact saved")); setOpen(false); setFile(null); onUploaded() }
    catch (error) { toast.error(error instanceof Error ? error.message : t("Could not upload artifact")) }
    finally { setPending(false) }
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}><FilePlus2 data-icon="inline-start" />{t("Add artifact")}</DialogTrigger>
    <DialogContent>
      <form onSubmit={submit}>
        <DialogHeader><DialogTitle>{t("Add run artifact")}</DialogTitle><DialogDescription>{t("Save a log, configuration, result, checkpoint, or any other evidence file with this run.")}</DialogDescription></DialogHeader>
        <FieldGroup className="py-5">
          <Field><FieldLabel htmlFor="artifact-file">{t("File")}</FieldLabel><Input id="artifact-file" type="file" required onChange={(event) => setFile(event.target.files?.[0] || null)} /><FieldDescription>{t("Files remain downloadable; supported text formats can also be viewed inline.")}</FieldDescription></Field>
          <Field><FieldLabel>{t("Artifact type")}</FieldLabel><Select value={kind} onValueChange={(value) => value && setKind(String(value))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="artifact">{t("General artifact")}</SelectItem><SelectItem value="log">{t("Log / output")}</SelectItem><SelectItem value="config">{t("Configuration")}</SelectItem></SelectGroup></SelectContent></Select></Field>
        </FieldGroup>
        <DialogFooter showCloseButton><Button type="submit" disabled={pending || !file}>{pending ? t("Saving…") : t("Save artifact")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
