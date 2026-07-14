"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { Check, Fingerprint, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck, Users } from "lucide-react"
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
  if (error instanceof DOMException && error.name === "NotAllowedError") return "Passkey request was cancelled or timed out."
  return error instanceof Error ? error.message : "Something went wrong"
}

function SetupScreen({ status, onComplete }: { status: AuthStatus; onComplete: () => Promise<void> }) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const setupToken = useSyncExternalStore(
    () => () => undefined,
    () => new URLSearchParams(window.location.search).get("setup"),
    () => null,
  )

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await action()
      window.history.replaceState({}, "", window.location.pathname)
      await onComplete()
    } catch (error) {
      toast.error(readableError(error))
    } finally {
      setBusy(false)
    }
  }

  const isInvite = Boolean(setupToken)
  const isBootstrap = !status.configured && !isInvite

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
              {isInvite ? "Save a passkey to activate the access an admin granted you." : isBootstrap ? "Create the first owner account and secure this instance with passkey authentication." : "Use the passkey saved for your RunTrace identity."}
            </p>
            <ol className="mt-10 space-y-7">
              {[
                [Users, isInvite ? "Identity created" : "Create owner identity", isInvite ? "An admin has granted your access." : "You’ll own and administer this instance."],
                [Fingerprint, "Save a passkey", "Sign in with your fingerprint, face, screen lock, or security key."],
                [ShieldCheck, "Ready for your team", "Manage access without sharing passwords."],
              ].map(([Icon, title, description], index) => {
                const StepIcon = Icon as typeof Users
                return (
                  <li className="flex gap-4" key={title as string}>
                    <div className="grid size-9 shrink-0 place-items-center rounded-full border bg-background text-primary">
                      {index === 0 && (isInvite || status.configured) ? <Check className="size-4" /> : <StepIcon className="size-4" />}
                    </div>
                    <div><p className="font-medium">{title as string}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{description as string}</p></div>
                  </li>
                )
              })}
            </ol>
          </section>

          <section className="p-7 lg:p-10">
            <h2 className="text-xl font-semibold tracking-tight">
              {isInvite ? "Save your passkey" : isBootstrap ? "Secure this instance" : "Sign in to RunTrace"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isInvite ? "This setup link can only be used once." : isBootstrap ? "Create the owner identity and save its first passkey." : "No password is required."}
            </p>

            {isBootstrap ? (
              <form className="mt-7 space-y-5" onSubmit={(event) => { event.preventDefault(); void act(() => auth.bootstrap(name)) }}>
                <div className="space-y-2"><Label htmlFor="owner-name">Full name</Label><Input id="owner-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" required /></div>
                <PasskeyNote />
                <Button size="lg" className="w-full" disabled={busy}><BusyIcon busy={busy} /><span>{busy ? "Waiting for your device…" : "Create owner & save passkey"}</span></Button>
              </form>
            ) : isInvite ? (
              <div className="mt-7 space-y-5">
                <PasskeyNote />
                <Button size="lg" className="w-full" disabled={busy || !setupToken} onClick={() => setupToken && void act(() => auth.setup(setupToken))}><BusyIcon busy={busy} /><span>{busy ? "Waiting for your device…" : "Save passkey & continue"}</span></Button>
              </div>
            ) : (
              <div className="mt-7 space-y-5">
                <PasskeyNote />
                <Button size="lg" className="w-full" disabled={busy} onClick={() => void act(() => auth.login())}><BusyIcon busy={busy} /><span>{busy ? "Waiting for your device…" : "Sign in with a passkey"}</span></Button>
              </div>
            )}
            <div className="mt-5 flex items-start justify-center gap-2 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" /><span>Your private key stays on your device. RunTrace stores only the public credential needed to verify you.</span></div>
          </section>
        </div>
      </div>
    </main>
  )
}

function PasskeyNote() {
  return (
    <div className="flex gap-4 rounded-xl border border-primary/25 bg-primary/[0.035] p-4">
      <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Fingerprint /></div>
      <div><p className="font-medium">Passkeys are simpler and more secure</p><p className="mt-1 text-sm leading-5 text-muted-foreground">Use your device security or a hardware key. There is no password to remember or share.</p></div>
    </div>
  )
}

function BusyIcon({ busy }: { busy: boolean }) {
  return busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <KeyRound data-icon="inline-start" />
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const refresh = useCallback(async () => setStatus(await auth.status()), [])

  useEffect(() => {
    auth.status().then(setStatus).catch((error) => toast.error(readableError(error)))
  }, [])

  const value = useMemo<AuthContextValue | null>(() => {
    if (!status?.identity) return null
    return {
      status,
      identity: status.identity,
      refresh,
      signOut: async () => { await auth.logout(); await refresh() },
    }
  }, [refresh, status])

  if (!status) return <main className="grid min-h-screen place-items-center"><LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Loading RunTrace" /></main>
  if (!status.authenticated || !value) return <SetupScreen status={status} onComplete={refresh} />
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
