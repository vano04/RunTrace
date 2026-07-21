"use client"

import { Laptop, Moon, RotateCcw, Settings, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { useAppearance } from "@/components/appearance-provider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/components/i18n-provider"

const THEME_OPTIONS = [
  { value: "light", label: "Light" as const, icon: Sun },
  { value: "dark", label: "Dark" as const, icon: Moon },
  { value: "system", label: "Auto" as const, icon: Laptop },
]

export function AppSettingsDialog() {
  const { theme, setTheme } = useTheme()
  const { t } = useI18n()
  const { accent, compactRows, setAccent, setCompactRows, resetAppearance } = useAppearance()

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger render={<DialogTrigger render={<Button variant="ghost" size="icon" aria-label={t("Open app settings")} />} />}>
          <Settings />
        </TooltipTrigger>
        <TooltipContent>{t("App settings")}</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("App settings")}</DialogTitle>
          <DialogDescription>{t("Personalize RunTrace on this browser. Project data is not affected.")}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldTitle id="theme-label">{t("Appearance")}</FieldTitle>
            <FieldDescription>{t("Use a light or dark interface, or follow your device.")}</FieldDescription>
            <ToggleGroup
              aria-labelledby="theme-label"
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
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { resetAppearance(); setTheme("system") }}>
            <RotateCcw data-icon="inline-start" />
            {t("Reset defaults")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
