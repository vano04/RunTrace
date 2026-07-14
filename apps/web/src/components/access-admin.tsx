"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Bot, Check, Copy, KeyRound, LoaderCircle, Plus, Search, ShieldCheck, Trash2, UserRound, UserRoundX } from "lucide-react"
import { toast } from "sonner"

import { AccountMenu } from "@/components/account-menu"
import { useAuth } from "@/components/auth-provider"
import { RunTraceLogo } from "@/components/runtrace-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { auth, type ApiToken, type AuthIdentity, type IdentityRole, type IdentityStatus } from "@/lib/auth"
import { runtrace } from "@/lib/api"
import type { Project } from "@/lib/types"

function formatDate(value?: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))
}

function initials(username: string) {
  return username.slice(0, 2).toUpperCase()
}

function statusLabel(status: IdentityStatus) {
  return status === "pending" ? "Pending setup" : status[0].toUpperCase() + status.slice(1)
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall back for embedded browsers that expose Clipboard but deny writes.
    }
  }

  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()

  try {
    if (!document.execCommand("copy")) throw new Error("Copy command was rejected")
  } finally {
    textarea.remove()
  }
}

function SetupLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString()
  return (
    <div className="space-y-2">
      <Label htmlFor="setup-link">One-time setup link</Label>
      <div className="flex gap-2"><Input id="setup-link" value={url} readOnly className="font-mono text-xs" /><Button variant="outline" size="icon" aria-label="Copy setup link" onClick={() => copyText(url).then(() => { setCopied(true); toast.success("Setup link copied") }).catch(() => toast.error("Could not copy setup link"))}>{copied ? <Check /> : <Copy />}</Button></div>
      <p className="text-xs leading-5 text-muted-foreground">Share this link securely. It expires in 24 hours and is replaced if you create another.</p>
    </div>
  )
}

function AddIdentityDialog({ onCreated }: { onCreated: (identity: AuthIdentity) => void }) {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [role, setRole] = useState<"admin" | "member">("member")
  const [busy, setBusy] = useState(false)
  const [setupPath, setSetupPath] = useState<string | null>(null)

  const reset = () => { setUsername(""); setRole("member"); setSetupPath(null) }
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <DialogTrigger render={<Button />}><Plus data-icon="inline-start" />Add identity</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{setupPath ? "Identity created" : "Add identity"}</DialogTitle><DialogDescription>{setupPath ? "Send this person their one-time password setup link." : "Grant someone access to this RunTrace instance."}</DialogDescription></DialogHeader>
        {setupPath ? <SetupLink path={setupPath} /> : (
          <form id="add-identity" className="space-y-4" onSubmit={(event) => {
            event.preventDefault(); setBusy(true)
            auth.createIdentity({ username, role }).then((result) => { onCreated(result.identity); setSetupPath(result.setup_path) }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not create identity")).finally(() => setBusy(false))
          }}>
            <div className="space-y-2"><Label htmlFor="identity-username">Username</Label><Input id="identity-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]*" placeholder="taylor" autoCapitalize="none" spellCheck={false} required /></div>
            <div className="space-y-2"><Label htmlFor="identity-role">Role</Label><select id="identity-role" className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" value={role} onChange={(event) => setRole(event.target.value as "admin" | "member")}><option value="member">Member</option><option value="admin">Admin</option></select><p className="text-xs text-muted-foreground">Admins manage instance access. Members use projects and runs.</p></div>
            <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/[0.035] p-3 text-sm"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><p>A one-time setup link will be generated so this person can choose their password.</p></div>
          </form>
        )}
        <DialogFooter>{setupPath ? <Button onClick={() => setOpen(false)}>Done</Button> : <Button form="add-identity" type="submit" disabled={busy}>{busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Plus data-icon="inline-start" />}Create identity</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddTokenDialog({ projects, onCreated }: { projects: Project[]; onCreated: (token: ApiToken) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("Agent CLI")
  const [expires, setExpires] = useState("90")
  const [secret, setSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [projectIds, setProjectIds] = useState<string[] | null>(null)
  const selectedProjectIds = projectIds ?? projects.map((project) => project.id)
  const reset = () => { setName("Agent CLI"); setExpires("90"); setSecret(null); setCopied(false); setProjectIds(null) }
  const close = () => { setOpen(false); reset() }
  return <Dialog open={open} onOpenChange={(next) => { if (next) setOpen(true); else close() }}>
    <DialogTrigger render={<Button variant="outline" />}><Plus data-icon="inline-start" />Create token</DialogTrigger>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>{secret ? "Copy your agent token" : "Create agent token"}</DialogTitle><DialogDescription>{secret ? "This token is shown once. Store it in your secret manager before closing." : "Use a scoped identity token for the Python CLI, MCP, Codex, or Claude Code."}</DialogDescription></DialogHeader>
      {secret ? <div className="space-y-3"><div className="flex gap-2"><Input value={secret} readOnly className="font-mono text-xs" /><Button variant="outline" size="icon" aria-label="Copy token" onClick={() => copyText(secret).then(() => { setCopied(true); toast.success("Token copied") }).catch(() => toast.error("Could not copy token"))}>{copied ? <Check /> : <Copy />}</Button></div><p className="text-xs text-muted-foreground">Set it as <code>RUNTRACE_API_TOKEN</code>. RunTrace stores only its SHA-256 digest.</p></div> : <form id="add-token" className="space-y-4" onSubmit={(event) => { event.preventDefault(); setBusy(true); auth.createToken({ name, expires_in_days: expires ? Number(expires) : null, project_ids: selectedProjectIds }).then((result) => { setSecret(result.token); setCopied(false); onCreated(result.api_token) }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not create token")).finally(() => setBusy(false)) }}><div className="space-y-2"><Label htmlFor="token-name">Name</Label><Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} required /></div><fieldset className="space-y-2"><Label>Projects</Label><div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border p-3">{projects.map((project) => <label key={project.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedProjectIds.includes(project.id)} onChange={(event) => setProjectIds((current) => { const selected = current ?? projects.map((item) => item.id); return event.target.checked ? [...selected, project.id] : selected.filter((id) => id !== project.id) })} />{project.name}</label>)}</div><p className="text-xs text-muted-foreground">The token can only access the selected projects.</p></fieldset><div className="space-y-2"><Label htmlFor="token-expiry">Expires</Label><select id="token-expiry" value={expires} onChange={(event) => setExpires(event.target.value)} className="h-9 w-full rounded-lg border bg-background px-3 text-sm"><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="">Never</option></select></div></form>}
      <DialogFooter>{secret ? <Button onClick={close}>I saved it</Button> : <Button form="add-token" type="submit" disabled={busy || selectedProjectIds.length === 0}>{busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <KeyRound data-icon="inline-start" />}Create token</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>
}

export function AccessAdmin() {
  const { identity: current } = useAuth()
  const [identities, setIdentities] = useState<AuthIdentity[] | null>(null)
  const [query, setQuery] = useState("")
  const [role, setRole] = useState<"all" | IdentityRole>("all")
  const [status, setStatus] = useState<"all" | IdentityStatus>("all")
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const isAdmin = current.role === "owner" || current.role === "admin"

  const load = () => auth.identities().then(setIdentities).catch((error) => { toast.error(error instanceof Error ? error.message : "Could not load identities"); setIdentities([]) })
  const loadTokens = () => auth.tokens().then(setTokens).catch((error) => { toast.error(error instanceof Error ? error.message : "Could not load tokens"); setTokens([]) })
  useEffect(() => { if (isAdmin) void load(); void loadTokens(); void runtrace.projects().then(setProjects) }, [isAdmin])

  const filtered = useMemo(() => (identities ?? []).filter((item) => {
    const matchesQuery = item.username.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (role === "all" || item.role === role) && (status === "all" || item.status === status)
  }), [identities, query, role, status])

  const replace = (updated: AuthIdentity) => setIdentities((items) => (items ?? []).map((item) => item.id === updated.id ? { ...item, ...updated } : item))
  const mutate = (id: string, body: { role?: "admin" | "member"; status?: "active" | "suspended" }) => auth.updateIdentity(id, body).then((updated) => { replace(updated); toast.success("Access updated") }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not update access"))
  const createLink = (item: AuthIdentity) => auth.setupLink(item.id).then(({ setup_path }) => navigator.clipboard.writeText(new URL(setup_path, window.location.origin).toString()).then(() => toast.success("New setup link copied"))).catch((error) => toast.error(error instanceof Error ? error.message : "Could not create setup link"))

  return (
    <main className="min-h-screen">
      <header className="flex h-16 items-center justify-between border-b px-4 sm:px-8"><div className="flex items-center gap-3"><RunTraceLogo /><span className="h-5 w-px bg-border" /><Button variant="ghost" render={<Link href="/" />} nativeButton={false}><ArrowLeft data-icon="inline-start" />Projects</Button></div><AccountMenu /></header>
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><h1 className="text-3xl font-semibold tracking-tight">{isAdmin ? "Access" : "Agent tokens"}</h1><p className="mt-2 text-muted-foreground">{isAdmin ? "Manage identities and API access for this RunTrace instance." : "Create project-scoped credentials for headless clients."}</p></div>{isAdmin ? <AddIdentityDialog onCreated={(created) => setIdentities((items) => [...(items ?? []), created])} /> : null}</div>
        {isAdmin ? <>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-80"><Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by username" aria-label="Search identities" /></div>
          <select aria-label="Filter by role" value={role} onChange={(event) => setRole(event.target.value as typeof role)} className="h-9 rounded-lg border bg-background px-3 text-sm"><option value="all">All roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="member">Member</option></select>
          <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-9 rounded-lg border bg-background px-3 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="pending">Pending setup</option><option value="suspended">Suspended</option></select>
        </div>
        <div className="overflow-hidden rounded-xl border bg-card">
          {identities === null ? <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div> : filtered.length ? (
            <Table><TableHeader><TableRow><TableHead className="pl-5">Identity</TableHead><TableHead>Role</TableHead><TableHead>Password</TableHead><TableHead>Status</TableHead><TableHead>Last active</TableHead><TableHead className="pr-5">Actions</TableHead></TableRow></TableHeader><TableBody>{filtered.map((item) => {
              const owner = item.role === "owner"
              return <TableRow key={item.id} className={item.status === "suspended" ? "opacity-60" : undefined}><TableCell className="pl-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(item.username)}</span><p className="font-medium">{item.username}{item.id === current.id ? <span className="ml-2 text-xs font-normal text-muted-foreground">You</span> : null}</p></div></TableCell><TableCell>{owner ? <Badge variant="outline">Owner</Badge> : <select aria-label={`Role for ${item.username}`} value={item.role} onChange={(event) => void mutate(item.id, { role: event.target.value as "admin" | "member" })} className="h-8 rounded-md border bg-background px-2 text-sm"><option value="admin">Admin</option><option value="member">Member</option></select>}</TableCell><TableCell>{item.password_set ? "Set" : "Not set"}</TableCell><TableCell><Badge variant="outline" className={item.status === "active" ? "border-success/30 bg-success/10 text-success" : item.status === "pending" ? "border-status-pending/30 bg-status-pending/10 text-status-pending" : ""}>{statusLabel(item.status)}</Badge></TableCell><TableCell>{formatDate(item.last_active_at)}</TableCell><TableCell className="pr-5"><div className="flex gap-2">{!owner && item.status !== "suspended" ? <Button variant="outline" size="sm" onClick={() => void mutate(item.id, { status: "suspended" })}><UserRoundX data-icon="inline-start" />Suspend</Button> : null}{!owner && item.status === "suspended" ? <Button variant="outline" size="sm" onClick={() => void mutate(item.id, { status: "active" })}><UserRound data-icon="inline-start" />Reactivate</Button> : null}{!owner ? <Button variant="ghost" size="sm" onClick={() => void createLink(item)}>Setup link</Button> : null}</div></TableCell></TableRow>
            })}</TableBody></Table>
          ) : <Empty className="min-h-72"><EmptyHeader><EmptyMedia variant="icon"><UserRound /></EmptyMedia><EmptyTitle>No matching identities</EmptyTitle><EmptyDescription>Adjust your search or filters.</EmptyDescription></EmptyHeader></Empty>}
        </div>
        </> : null}
        <div className={`${isAdmin ? "mt-12" : ""} mb-4 flex items-start justify-between gap-4`}><div><h2 className="text-xl font-semibold">{isAdmin ? "All agent tokens" : "Your agent tokens"}</h2><p className="mt-1 text-sm text-muted-foreground">Authenticate headless clients without sharing a browser session.</p></div><AddTokenDialog projects={projects} onCreated={(token) => setTokens((items) => [token, ...(items ?? [])])} /></div>
        <div className="overflow-hidden rounded-xl border bg-card">{tokens === null ? <div className="p-4"><Skeleton className="h-14" /></div> : tokens.length ? <Table><TableHeader><TableRow><TableHead className="pl-5">Token</TableHead>{isAdmin ? <TableHead>Owner</TableHead> : null}<TableHead>Projects</TableHead><TableHead>Prefix</TableHead><TableHead>Last used</TableHead><TableHead>Expires</TableHead><TableHead className="pr-5 text-right">Action</TableHead></TableRow></TableHeader><TableBody>{tokens.map((token) => <TableRow key={token.id}><TableCell className="pl-5 font-medium">{token.name}</TableCell>{isAdmin ? <TableCell>{token.identity?.username ?? "—"}</TableCell> : null}<TableCell className="max-w-64 text-sm">{token.projects.map((project) => project.name).join(", ")}</TableCell><TableCell className="font-mono text-xs">{token.prefix}…</TableCell><TableCell>{formatDate(token.last_used_at)}</TableCell><TableCell>{token.expires_at ? formatDate(token.expires_at) : "Never"}</TableCell><TableCell className="pr-5 text-right"><Button variant="ghost" size="sm" onClick={() => { if (window.confirm(`Revoke ${token.name}? Connected agents will stop working immediately.`)) auth.revokeToken(token.id).then(() => { setTokens((items) => (items ?? []).filter((item) => item.id !== token.id)); toast.success("Token revoked") }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not revoke token")) }}><Trash2 data-icon="inline-start" />Revoke</Button></TableCell></TableRow>)}</TableBody></Table> : <Empty className="min-h-52"><EmptyHeader><EmptyMedia variant="icon"><Bot /></EmptyMedia><EmptyTitle>No agent tokens</EmptyTitle><EmptyDescription>Create one before connecting a CLI or MCP host.</EmptyDescription></EmptyHeader></Empty>}</div>
      </section>
    </main>
  )
}
