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

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Laptop },
]

export function AppSettingsDialog() {
  const { theme, setTheme } = useTheme()
  const { accent, compactRows, setAccent, setCompactRows, resetAppearance } = useAppearance()

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger render={<DialogTrigger render={<Button variant="ghost" size="icon" aria-label="Open app settings" />} />}>
          <Settings />
        </TooltipTrigger>
        <TooltipContent>App settings</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>App settings</DialogTitle>
          <DialogDescription>Personalize RunTrace on this browser. Project data is not affected.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldTitle id="theme-label">Appearance</FieldTitle>
            <FieldDescription>Use a light or dark interface, or follow your device.</FieldDescription>
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
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="accent-color">Accent color</FieldLabel>
              <FieldDescription>Used for primary actions, focus rings, and progress.</FieldDescription>
            </FieldContent>
            <div className="flex items-center gap-2">
              <Input
                id="accent-color"
                type="color"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                className="size-10 p-1"
                aria-label="Accent color"
              />
              <code className="min-w-18 text-xs text-muted-foreground">{accent.toUpperCase()}</code>
            </div>
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="compact-rows">Compact rows</FieldLabel>
              <FieldDescription>Fit more projects and experiment records on screen.</FieldDescription>
            </FieldContent>
            <Switch id="compact-rows" checked={compactRows} onCheckedChange={setCompactRows} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { resetAppearance(); setTheme("system") }}>
            <RotateCcw data-icon="inline-start" />
            Reset defaults
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
