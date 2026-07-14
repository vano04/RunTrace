"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, Copy, KeyRound, LoaderCircle, Plus, Search, ShieldCheck, UserRound, UserRoundX } from "lucide-react"
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
import { auth, type AuthIdentity, type IdentityRole, type IdentityStatus } from "@/lib/auth"

function formatDate(value?: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
}

function statusLabel(status: IdentityStatus) {
  return status === "pending" ? "Pending setup" : status[0].toUpperCase() + status.slice(1)
}

function SetupLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString()
  return (
    <div className="space-y-2">
      <Label htmlFor="setup-link">One-time setup link</Label>
      <div className="flex gap-2"><Input id="setup-link" value={url} readOnly className="font-mono text-xs" /><Button variant="outline" size="icon" aria-label="Copy setup link" onClick={() => navigator.clipboard.writeText(url).then(() => { setCopied(true); toast.success("Setup link copied") })}>{copied ? <Check /> : <Copy />}</Button></div>
      <p className="text-xs leading-5 text-muted-foreground">Share this link securely. It expires in 24 hours and is replaced if you create another.</p>
    </div>
  )
}

function AddIdentityDialog({ onCreated }: { onCreated: (identity: AuthIdentity) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [role, setRole] = useState<"admin" | "member">("member")
  const [busy, setBusy] = useState(false)
  const [setupPath, setSetupPath] = useState<string | null>(null)

  const reset = () => { setName(""); setRole("member"); setSetupPath(null) }
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <DialogTrigger render={<Button />}><Plus data-icon="inline-start" />Add identity</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{setupPath ? "Identity created" : "Add identity"}</DialogTitle><DialogDescription>{setupPath ? "Send this person their one-time passkey setup link." : "Grant someone access to this RunTrace instance."}</DialogDescription></DialogHeader>
        {setupPath ? <SetupLink path={setupPath} /> : (
          <form id="add-identity" className="space-y-4" onSubmit={(event) => {
            event.preventDefault(); setBusy(true)
            auth.createIdentity({ name, role }).then((result) => { onCreated(result.identity); setSetupPath(result.setup_path) }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not create identity")).finally(() => setBusy(false))
          }}>
            <div className="space-y-2"><Label htmlFor="identity-name">Full name</Label><Input id="identity-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" placeholder="Taylor Smith" required /></div>
            <div className="space-y-2"><Label htmlFor="identity-role">Role</Label><select id="identity-role" className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" value={role} onChange={(event) => setRole(event.target.value as "admin" | "member")}><option value="member">Member</option><option value="admin">Admin</option></select><p className="text-xs text-muted-foreground">Admins manage instance access. Members use projects and runs.</p></div>
            <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/[0.035] p-3 text-sm"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><p>A one-time setup link will be generated so this person can save their passkey.</p></div>
          </form>
        )}
        <DialogFooter>{setupPath ? <Button onClick={() => setOpen(false)}>Done</Button> : <Button form="add-identity" type="submit" disabled={busy}>{busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Plus data-icon="inline-start" />}Create identity</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PasskeysDialog({ identity, onChanged }: { identity: AuthIdentity; onChanged: () => void }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="link" className="h-auto px-0" />}>{identity.passkeys?.length ?? 0}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Passkeys for {identity.name}</DialogTitle><DialogDescription>Public credential metadata only. RunTrace never sees or stores private key material.</DialogDescription></DialogHeader>
        {identity.passkeys?.length ? <div className="divide-y rounded-lg border">{identity.passkeys.map((passkey) => <div key={passkey.id} className="flex items-center gap-3 p-3"><div className="grid size-9 place-items-center rounded-full bg-muted"><KeyRound className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate font-medium">{passkey.name}</p><p className="text-xs text-muted-foreground">Added {formatDate(passkey.created_at)} · Last used {formatDate(passkey.last_used_at)}</p></div><Button variant="outline" size="sm" disabled={identity.role === "owner" && identity.passkeys?.length === 1} onClick={() => { if (window.confirm(`Revoke ${passkey.name}? This signs ${identity.name} out everywhere.`)) auth.revokePasskey(identity.id, passkey.id).then(() => { toast.success("Passkey revoked"); onChanged() }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not revoke passkey")) }}>Revoke</Button></div>)}</div> : <Empty className="min-h-52 border"><EmptyHeader><EmptyMedia variant="icon"><KeyRound /></EmptyMedia><EmptyTitle>No passkeys yet</EmptyTitle><EmptyDescription>This identity has not completed setup.</EmptyDescription></EmptyHeader></Empty>}
      </DialogContent>
    </Dialog>
  )
}

export function AccessAdmin() {
  const { identity: current } = useAuth()
  const [identities, setIdentities] = useState<AuthIdentity[] | null>(null)
  const [query, setQuery] = useState("")
  const [role, setRole] = useState<"all" | IdentityRole>("all")
  const [status, setStatus] = useState<"all" | IdentityStatus>("all")

  const load = () => auth.identities().then(setIdentities).catch((error) => { toast.error(error instanceof Error ? error.message : "Could not load identities"); setIdentities([]) })
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => (identities ?? []).filter((item) => {
    const matchesQuery = item.name.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (role === "all" || item.role === role) && (status === "all" || item.status === status)
  }), [identities, query, role, status])

  const replace = (updated: AuthIdentity) => setIdentities((items) => (items ?? []).map((item) => item.id === updated.id ? { ...item, ...updated } : item))
  const mutate = (id: string, body: { role?: "admin" | "member"; status?: "active" | "suspended" }) => auth.updateIdentity(id, body).then((updated) => { replace(updated); toast.success("Access updated") }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not update access"))
  const createLink = (item: AuthIdentity) => auth.setupLink(item.id).then(({ setup_path }) => navigator.clipboard.writeText(new URL(setup_path, window.location.origin).toString()).then(() => toast.success("New setup link copied"))).catch((error) => toast.error(error instanceof Error ? error.message : "Could not create setup link"))

  return (
    <main className="min-h-screen">
      <header className="flex h-16 items-center justify-between border-b px-4 sm:px-8"><div className="flex items-center gap-3"><RunTraceLogo /><span className="h-5 w-px bg-border" /><Button variant="ghost" render={<Link href="/" />} nativeButton={false}><ArrowLeft data-icon="inline-start" />Projects</Button></div><AccountMenu /></header>
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><h1 className="text-3xl font-semibold tracking-tight">Access</h1><p className="mt-2 text-muted-foreground">Manage who can sign in to this RunTrace instance.</p></div><AddIdentityDialog onCreated={(created) => setIdentities((items) => [...(items ?? []), created])} /></div>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-80"><Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" aria-label="Search identities" /></div>
          <select aria-label="Filter by role" value={role} onChange={(event) => setRole(event.target.value as typeof role)} className="h-9 rounded-lg border bg-background px-3 text-sm"><option value="all">All roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="member">Member</option></select>
          <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-9 rounded-lg border bg-background px-3 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="pending">Pending setup</option><option value="suspended">Suspended</option></select>
        </div>
        <div className="overflow-hidden rounded-xl border bg-card">
          {identities === null ? <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div> : filtered.length ? (
            <Table><TableHeader><TableRow><TableHead className="pl-5">Identity</TableHead><TableHead>Role</TableHead><TableHead>Passkeys</TableHead><TableHead>Status</TableHead><TableHead>Last active</TableHead><TableHead className="pr-5">Actions</TableHead></TableRow></TableHeader><TableBody>{filtered.map((item) => {
              const owner = item.role === "owner"
              return <TableRow key={item.id} className={item.status === "suspended" ? "opacity-60" : undefined}><TableCell className="pl-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(item.name)}</span><p className="font-medium">{item.name}{item.id === current.id ? <span className="ml-2 text-xs font-normal text-muted-foreground">You</span> : null}</p></div></TableCell><TableCell>{owner ? <Badge variant="outline">Owner</Badge> : <select aria-label={`Role for ${item.name}`} value={item.role} onChange={(event) => void mutate(item.id, { role: event.target.value as "admin" | "member" })} className="h-8 rounded-md border bg-background px-2 text-sm"><option value="admin">Admin</option><option value="member">Member</option></select>}</TableCell><TableCell><PasskeysDialog identity={item} onChanged={load} /></TableCell><TableCell><Badge variant="outline" className={item.status === "active" ? "border-success/30 bg-success/10 text-success" : item.status === "pending" ? "border-status-pending/30 bg-status-pending/10 text-status-pending" : ""}>{statusLabel(item.status)}</Badge></TableCell><TableCell>{formatDate(item.last_active_at)}</TableCell><TableCell className="pr-5"><div className="flex gap-2">{!owner && item.status !== "suspended" ? <Button variant="outline" size="sm" onClick={() => void mutate(item.id, { status: "suspended" })}><UserRoundX data-icon="inline-start" />Suspend</Button> : null}{!owner && item.status === "suspended" ? <Button variant="outline" size="sm" onClick={() => void mutate(item.id, { status: "active" })}><UserRound data-icon="inline-start" />Reactivate</Button> : null}{!owner ? <Button variant="ghost" size="sm" onClick={() => void createLink(item)}>Setup link</Button> : null}</div></TableCell></TableRow>
            })}</TableBody></Table>
          ) : <Empty className="min-h-72"><EmptyHeader><EmptyMedia variant="icon"><UserRound /></EmptyMedia><EmptyTitle>No matching identities</EmptyTitle><EmptyDescription>Adjust your search or filters.</EmptyDescription></EmptyHeader></Empty>}
        </div>
      </section>
    </main>
  )
}
