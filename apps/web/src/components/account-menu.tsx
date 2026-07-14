"use client"

import Link from "next/link"
import { KeyRound, LogOut, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function AccountMenu() {
  const { identity, signOut, status } = useAuth()
  const initials = identity.username.slice(0, 2).toUpperCase()

  if (status.dev) return <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Dev · no auth</span>
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 px-2" />}>
        <span className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{initials}</span>
        <span className="hidden max-w-36 truncate sm:inline">{identity.username}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel><span className="block truncate text-foreground">{identity.username}</span><span className="block font-normal capitalize">{identity.role}</span></DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/access" />}><ShieldCheck />{identity.role === "member" ? "Agent tokens" : "Access"}</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account" />}><KeyRound />{identity.password_set === false ? "Set password" : "Change password"}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => signOut().catch(() => toast.error("Could not sign out"))}><LogOut />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
