"use client"

import Link from "next/link"
import { useState } from "react"
import { KeyRound, LoaderCircle, LogOut, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { auth } from "@/lib/auth"

function ChangePasswordDialog({ open, onOpenChange, passwordSet }: { open: boolean; onOpenChange: (open: boolean) => void; passwordSet: boolean }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)

  const close = () => { setCurrent(""); setNext(""); setConfirmation(""); onOpenChange(false) }
  return <Dialog open={open} onOpenChange={(value) => { if (!value) close(); else onOpenChange(true) }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{passwordSet ? "Change password" : "Set a password"}</DialogTitle><DialogDescription>{passwordSet ? "Changing your password signs out your other browser sessions." : "Set a password before this legacy session expires."}</DialogDescription></DialogHeader>
      <form id="change-password" className="space-y-4" onSubmit={(event) => {
        event.preventDefault()
        if (next !== confirmation) { toast.error("Passwords do not match"); return }
        setBusy(true)
        auth.changePassword(current, next).then(() => { toast.success("Password changed"); close() }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not change password")).finally(() => setBusy(false))
      }}>
        {passwordSet ? <div className="space-y-2"><Label htmlFor="current-password">Current password</Label><Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required /></div> : null}
        <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={12} value={next} onChange={(event) => setNext(event.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div>
      </form>
      <DialogFooter><Button form="change-password" type="submit" disabled={busy}>{busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <KeyRound data-icon="inline-start" />}{passwordSet ? "Change password" : "Set password"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

export function AccountMenu() {
  const { identity, signOut, status } = useAuth()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const initials = identity.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()

  if (status.dev) return <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Dev · no auth</span>
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 px-2" />}>
        <span className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{initials}</span>
        <span className="hidden max-w-36 truncate sm:inline">{identity.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel><span className="block truncate text-foreground">{identity.name}</span><span className="block font-normal capitalize">{identity.role}</span></DropdownMenuLabel>
        <DropdownMenuSeparator />
        {identity.role !== "member" ? <DropdownMenuItem render={<Link href="/access" />}><ShieldCheck />Access</DropdownMenuItem> : null}
        <DropdownMenuItem onClick={() => setPasswordOpen(true)}><KeyRound />{identity.password_set === false ? "Set password" : "Change password"}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => signOut().catch(() => toast.error("Could not sign out"))}><LogOut />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} passwordSet={identity.password_set !== false} />
  </>
}
