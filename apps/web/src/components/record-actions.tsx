"use client"

import { useState } from "react"
import { Archive, MoreVertical, Pencil, RotateCcw, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EditExperimentDialog } from "@/components/edit-experiment-dialog"
import { runtrace } from "@/lib/api"
import { useI18n } from "@/components/i18n-provider"

export function RecordActions({ slug, id, type, archived = false, canBaseline = false, onChanged }: {
  slug: string; id: string; type: "experiment" | "run"; archived?: boolean; canBaseline?: boolean; onChanged: () => void
}) {
  const { t } = useI18n()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  async function perform(action: "archive" | "restore" | "baseline" | "delete") {
    try {
      if (action === "baseline") await runtrace.setBaseline(slug, id)
      else if (type === "experiment") {
        if (action === "archive") await runtrace.archiveExperiment(slug, id)
        if (action === "restore") await runtrace.restoreExperiment(slug, id)
        if (action === "delete") await runtrace.deleteExperiment(slug, id)
      } else {
        if (action === "archive") await runtrace.archiveRun(id)
        if (action === "restore") await runtrace.restoreRun(id)
        if (action === "delete") await runtrace.deleteRun(id)
      }
      toast.success(action === "baseline" ? t("Baseline updated") : `Record ${action}d`)
      onChanged()
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Action failed")) }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("Record actions")} />}><MoreVertical /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {canBaseline ? <DropdownMenuItem onClick={() => perform("baseline")}><Star />{t("Set as baseline")}</DropdownMenuItem> : null}
            {type === "experiment" ? <DropdownMenuItem onClick={() => setEditOpen(true)}><Pencil />{t("Edit")}</DropdownMenuItem> : null}
            <DropdownMenuItem onClick={() => perform(archived ? "restore" : "archive")}>
              {archived ? <RotateCcw /> : <Archive />}{archived ? t("Restore") : t("Archive")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}><Trash2 />{t("Delete")}</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("Delete this record?")}</AlertDialogTitle><AlertDialogDescription>{t("This soft-deletes the record from ordinary retrieval. Archive it instead if you may need to restore it later.")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("Cancel")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => perform("delete")}>{t("Delete")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {type === "experiment" ? <EditExperimentDialog slug={slug} id={id} open={editOpen} onOpenChange={setEditOpen} onUpdated={onChanged} /> : null}
    </>
  )
}
