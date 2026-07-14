"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, Users } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { auth, type ProjectMember, type ProjectRole } from "@/lib/auth"

export function ProjectAccessCard({ project }: { project: string }) {
  const [members, setMembers] = useState<ProjectMember[] | null>(null)
  const [allowed, setAllowed] = useState(true)
  const [username, setUsername] = useState("")
  const [role, setRole] = useState<ProjectRole>("viewer")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    auth.projectMembers(project).then(setMembers).catch(() => setAllowed(false))
  }, [project])

  if (!allowed) return null
  const replace = (updated: ProjectMember) => setMembers((current) => (current ?? []).map((member) => member.identity.id === updated.identity.id ? updated : member))
  const add = async () => {
    setBusy(true)
    try {
      const created = await auth.addProjectMember(project, { username: username.trim(), role })
      setMembers((current) => [...(current ?? []), created]); setUsername(""); toast.success("Project access granted")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not grant project access") }
    finally { setBusy(false) }
  }

  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4" />Project access</CardTitle><CardDescription>Owners manage access, editors can change project data, and viewers have read-only access.</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="flex-1 space-y-2"><Label htmlFor="member-username">Username</Label><Input id="member-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="taylor" /></div><div className="space-y-2"><Label htmlFor="member-role">Permission</Label><select id="member-role" value={role} onChange={(event) => setRole(event.target.value as ProjectRole)} className="h-9 rounded-lg border bg-background px-3 text-sm"><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="owner">Owner</option></select></div><Button type="button" onClick={add} disabled={busy || username.trim().length < 3}><Plus />Add</Button></div>
    {members?.length ? <div className="overflow-hidden rounded-lg border"><Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Permission</TableHead><TableHead className="w-12"><span className="sr-only">Remove</span></TableHead></TableRow></TableHeader><TableBody>{members.map((member) => <TableRow key={member.identity.id}><TableCell className="font-medium">{member.identity.username}</TableCell><TableCell><select aria-label={`Permission for ${member.identity.username}`} value={member.role} onChange={(event) => auth.updateProjectMember(project, member.identity.id, event.target.value as ProjectRole).then(replace).catch((error) => toast.error(error instanceof Error ? error.message : "Could not update permission"))} className="h-8 rounded-md border bg-background px-2 text-sm"><option value="owner">Owner</option><option value="editor">Editor</option><option value="viewer">Viewer</option></select></TableCell><TableCell><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${member.identity.username}`} onClick={() => auth.removeProjectMember(project, member.identity.id).then(() => setMembers((current) => (current ?? []).filter((item) => item.identity.id !== member.identity.id))).catch((error) => toast.error(error instanceof Error ? error.message : "Could not remove access"))}><Trash2 /></Button></TableCell></TableRow>)}</TableBody></Table></div> : null}
  </CardContent></Card>
}
