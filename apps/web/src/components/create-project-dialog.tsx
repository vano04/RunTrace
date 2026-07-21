"use client"

import { FormEvent, useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { runtrace } from "@/lib/api"
import type { Project } from "@/lib/types"
import { useI18n } from "@/components/i18n-provider"

function toSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

export function CreateProjectDialog({ onCreated }: { onCreated: (project: Project) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [repositoryUrl, setRepositoryUrl] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const project = await runtrace.createProject({
        name: name.trim(), slug: slug.trim(), description: description.trim(),
        ...(repositoryUrl.trim() ? { repository_url: repositoryUrl.trim() } : {}),
      })
      onCreated(project)
      setOpen(false)
      setName(""); setSlug(""); setDescription(""); setRepositoryUrl("")
      toast.success(`${project.name} created`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not create project"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" /> {t("New project")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{t("Create a project")}</DialogTitle>
            <DialogDescription>{t("Start an empty experiment registry. Nothing is preloaded.")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="project-name">{t("Name")}</FieldLabel>
              <Input id="project-name" value={name} onChange={(event) => { setName(event.target.value); if (!slug || slug === toSlug(name)) setSlug(toSlug(event.target.value)) }} required autoFocus />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-slug">{t("Slug")}</FieldLabel>
              <Input id="project-slug" value={slug} onChange={(event) => setSlug(toSlug(event.target.value))} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required />
              <FieldDescription>{t("Used in API, SDK, and MCP calls.")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="project-description">{t("Goal")}</FieldLabel>
              <Textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("What should agents improve?")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="repository-url">{t("Repository URL")}</FieldLabel>
              <Input id="repository-url" type="url" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/org/repo" />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim() || !slug.trim()}>{pending ? t("Creating…") : t("Create project")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
