"use client"

import { Laptop, Moon, RotateCcw, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { useAppearance } from "@/components/appearance-provider"
import { useI18n } from "@/components/i18n-provider"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const THEME_OPTIONS = [
  { value: "light", label: "Light" as const, icon: Sun },
  { value: "dark", label: "Dark" as const, icon: Moon },
  { value: "system", label: "Auto" as const, icon: Laptop },
]

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const { t } = useI18n()
  const { accent, compactRows, setAccent, setCompactRows, resetAppearance } = useAppearance()

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold">{t("Appearance")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("Personalize RunTrace on this browser. Project data is not affected.")}</p>
      </div>
      <FieldGroup className="mt-6">
        <Field>
          <ToggleGroup
            aria-label={t("Appearance")}
            variant="outline"
            value={[theme ?? "system"]}
            onValueChange={(values) => values[0] && setTheme(values[0])}
            className="w-full"
            spacing={2}
          >
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <ToggleGroupItem key={value} value={value} className="flex-1">
                <Icon data-icon="inline-start" />
                {t(label)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="accent-color">{t("Accent color")}</FieldLabel>
            <FieldDescription>{t("Used for primary actions, focus rings, and progress.")}</FieldDescription>
          </FieldContent>
          <div className="flex items-center gap-2">
            <Input
              id="accent-color"
              type="color"
              value={accent}
              onChange={(event) => setAccent(event.target.value)}
              className="size-10 p-1"
              aria-label={t("Accent color")}
            />
            <code className="min-w-18 text-xs text-muted-foreground">{accent.toUpperCase()}</code>
          </div>
        </Field>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="compact-rows">{t("Compact rows")}</FieldLabel>
            <FieldDescription>{t("Fit more projects and experiment records on screen.")}</FieldDescription>
          </FieldContent>
          <Switch id="compact-rows" checked={compactRows} onCheckedChange={setCompactRows} />
        </Field>
      </FieldGroup>
      <div className="mt-6 flex justify-end">
        <Button type="button" variant="outline" onClick={() => { resetAppearance(); setTheme("system") }}>
          <RotateCcw data-icon="inline-start" />
          {t("Reset defaults")}
        </Button>
      </div>
    </div>
  )
}
