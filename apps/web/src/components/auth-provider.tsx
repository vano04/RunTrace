"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { Check, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck, Users } from "lucide-react"
import { toast } from "sonner"

import { RunTraceLogo } from "@/components/runtrace-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { auth, type AuthIdentity, type AuthStatus } from "@/lib/auth"

interface AuthContextValue {
  status: AuthStatus
  identity: AuthIdentity
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside AuthProvider")
  return context
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong"
}

function SetupScreen({ status, onComplete }: { status: AuthStatus; onComplete: () => Promise<void> }) {
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const setupToken = useSyncExternalStore(
    () => () => undefined,
    () => new URLSearchParams(window.location.search).get("setup"),
    () => null,
  )

  const isInvite = Boolean(setupToken)
  const isBootstrap = !status.configured && !isInvite

  const submit = async () => {
    if ((isInvite || isBootstrap) && password !== confirmation) {
      toast.error("Passwords do not match")
      return
    }
    setBusy(true)
    try {
      if (isBootstrap) await auth.bootstrap(name, password)
      else if (isInvite && setupToken) await auth.setup(setupToken, password)
      else await auth.login(name, password)
      window.history.replaceState({}, "", window.location.pathname)
      await onComplete()
    } catch (error) {
      toast.error(readableError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="flex h-16 items-center border-b px-5 sm:px-8"><RunTraceLogo /></header>
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-10 sm:px-8 sm:py-16">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm lg:grid lg:grid-cols-[0.8fr_1.2fr]">
          <section className="border-b bg-muted/25 p-7 lg:border-r lg:border-b-0 lg:p-10">
            <h1 className="max-w-sm text-2xl font-semibold tracking-tight">
              {isInvite ? "Finish setting up your identity" : isBootstrap ? "Let’s set up your RunTrace instance" : "Welcome back"}
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
              {isInvite ? "Choose a password to activate the access an admin granted you." : isBootstrap ? "Create the first owner account and choose a strong password." : "Sign in with your RunTrace identity."}
            </p>
            <ol className="mt-10 space-y-7">
              {[
                [Users, isInvite ? "Identity created" : "Create owner identity", isInvite ? "An admin has granted your access." : "You’ll own and administer this instance."],
                [KeyRound, "Choose a password", "Use at least 12 characters and keep it in a password manager."],
                [ShieldCheck, "Ready for your team", "Each person receives a separate identity and password."],
              ].map(([Icon, title, description], index) => {
                const StepIcon = Icon as typeof Users
                return <li className="flex gap-4" key={title as string}><div className="grid size-9 shrink-0 place-items-center rounded-full border bg-background text-primary">{index === 0 && (isInvite || status.configured) ? <Check className="size-4" /> : <StepIcon className="size-4" />}</div><div><p className="font-medium">{title as string}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{description as string}</p></div></li>
              })}
            </ol>
          </section>

          <section className="p-7 lg:p-10">
            <h2 className="text-xl font-semibold tracking-tight">{isInvite ? "Set your password" : isBootstrap ? "Secure this instance" : "Sign in to RunTrace"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{isInvite ? "This setup link can only be used once." : isBootstrap ? "Create the owner identity and its password." : "Enter your identity name and password."}</p>
            <form className="mt-7 space-y-5" onSubmit={(event) => { event.preventDefault(); void submit() }}>
              {!isInvite ? <div className="space-y-2"><Label htmlFor="identity-name">Full name</Label><Input id="identity-name" autoComplete="username" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" required /></div> : null}
              <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete={isBootstrap || isInvite ? "new-password" : "current-password"} minLength={isBootstrap || isInvite ? 12 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
              {isBootstrap || isInvite ? <div className="space-y-2"><Label htmlFor="password-confirmation">Confirm password</Label><Input id="password-confirmation" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div> : null}
              <Button size="lg" className="w-full" disabled={busy}>{busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <KeyRound data-icon="inline-start" />}<span>{busy ? "Please wait…" : isBootstrap ? "Create owner" : isInvite ? "Set password & continue" : "Sign in"}</span></Button>
            </form>
            <div className="mt-5 flex items-start justify-center gap-2 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" /><span>RunTrace stores a salted scrypt hash, never the password itself. On plain HTTP, use this only on a trusted LAN.</span></div>
          </section>
        </div>
      </div>
    </main>
  )
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const refresh = useCallback(async () => setStatus(await auth.status()), [])

  useEffect(() => { auth.status().then(setStatus).catch((error) => toast.error(readableError(error))) }, [])

  const value = useMemo<AuthContextValue | null>(() => {
    if (!status?.identity) return null
    return { status, identity: status.identity, refresh, signOut: async () => { await auth.logout(); await refresh() } }
  }, [refresh, status])

  if (!status) return <main className="grid min-h-screen place-items-center"><LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Loading RunTrace" /></main>
  if (!status.authenticated || !value) return <SetupScreen status={status} onComplete={refresh} />
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
