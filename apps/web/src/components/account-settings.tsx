"use client"

import Link from "next/link"
import { ArrowLeft, KeyRound, Languages, LoaderCircle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AccountMenu } from "@/components/account-menu"
import { useAuth } from "@/components/auth-provider"
import { RunTraceLogo } from "@/components/runtrace-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { auth } from "@/lib/auth"
import { useI18n } from "@/components/i18n-provider"
import { localeNames, supportedLocales, type Locale } from "@/i18n/config"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function AccountSettings() {
  const { identity, refresh } = useAuth()
  const { locale, setLocale, t } = useI18n()
  const passwordSet = identity.password_set !== false
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)

  return <main className="min-h-screen">
    <header className="flex h-16 items-center justify-between border-b px-4 sm:px-8"><div className="flex items-center gap-3"><RunTraceLogo /><span className="h-5 w-px bg-border" /><Button variant="ghost" render={<Link href="/" />} nativeButton={false}><ArrowLeft data-icon="inline-start" />{t("Projects")}</Button></div><AccountMenu /></header>
    <section className="mx-auto w-full max-w-xl px-4 py-10 sm:px-8 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t("Account")}</h1>
      <p className="mt-2 text-muted-foreground">{t("Signed in as")} <strong className="font-medium text-foreground">{identity.username}</strong>.</p>
      <div className="mt-8 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3"><Languages className="mt-0.5 size-5 text-muted-foreground" /><div><h2 className="text-xl font-semibold">{t("Language")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("Your language preference follows your account across devices.")}</p></div></div>
        <div className="mt-5 space-y-2"><Label htmlFor="account-language">{t("Language")}</Label><Select value={locale} onValueChange={(value) => {
          if (!value || value === locale) return
          auth.updatePreferences({ locale: value as Locale }).then(async () => { setLocale(value as Locale); await refresh(); toast.success(t("Language updated")) }).catch((error) => toast.error(error instanceof Error ? error.message : t("Could not update language")))
        }}><SelectTrigger id="account-language" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{supportedLocales.map((value) => <SelectItem key={value} value={value}>{localeNames[value]}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">{t("Select the language used for your RunTrace account.")}</p></div>
      </div>
      <div className="mt-8 rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold">{passwordSet ? t("Change password") : t("Set a password")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{passwordSet ? t("Changing your password signs out your other browser sessions.") : t("Set a password before this legacy session expires.")}</p>
        <form className="mt-6 space-y-4" onSubmit={(event) => {
          event.preventDefault()
          if (next !== confirmation) { toast.error(t("Passwords do not match")); return }
          setBusy(true)
          auth.changePassword(current, next).then(async () => { setCurrent(""); setNext(""); setConfirmation(""); await refresh(); toast.success(t("Password changed")) }).catch((error) => toast.error(error instanceof Error ? error.message : t("Could not change password"))).finally(() => setBusy(false))
        }}>
          {passwordSet ? <div className="space-y-2"><Label htmlFor="current-password">{t("Current password")}</Label><Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required /></div> : null}
          <div className="space-y-2"><Label htmlFor="new-password">{t("New password")}</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={12} value={next} onChange={(event) => setNext(event.target.value)} required /></div>
          <div className="space-y-2"><Label htmlFor="confirm-password">{t("Confirm new password")}</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div>
          <Button type="submit" disabled={busy}>{busy ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <KeyRound data-icon="inline-start" />}{passwordSet ? t("Change password") : t("Set password")}</Button>
        </form>
      </div>
    </section>
  </main>
}
