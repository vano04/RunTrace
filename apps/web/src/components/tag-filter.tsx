"use client"

import { Filter, Minus, Plus, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useI18n } from "@/components/i18n-provider"

type FilterState = "include" | "exclude" | "neutral"

export function TagFilter({ tags, include, exclude, onChange }: {
  tags: string[]
  include: string[]
  exclude: string[]
  onChange: (include: string[], exclude: string[]) => void
}) {
  const { t } = useI18n()
  const stateFor = (tag: string): FilterState => include.includes(tag) ? "include" : exclude.includes(tag) ? "exclude" : "neutral"
  const setState = (tag: string, state: FilterState) => onChange(
    state === "include" ? [...include.filter((value) => value !== tag), tag] : include.filter((value) => value !== tag),
    state === "exclude" ? [...exclude.filter((value) => value !== tag), tag] : exclude.filter((value) => value !== tag),
  )
  const cycle = (tag: string) => setState(tag, stateFor(tag) === "neutral" ? "include" : stateFor(tag) === "include" ? "exclude" : "neutral")
  const active = [...include.map((tag) => ({ tag, state: "include" as const })), ...exclude.map((tag) => ({ tag, state: "exclude" as const }))]

  return <div className="flex flex-wrap items-center gap-2">
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Filter data-icon="inline-start" />{t("Filter")}{active.length ? ` (${active.length})` : ""}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-3">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-0 pb-2 pt-0">{t("Click to include, exclude, or clear")}</DropdownMenuLabel>
          {tags.length ? <div className="flex flex-col gap-1">
          {tags.map((tag) => {
            const state = stateFor(tag)
            return <DropdownMenuItem
              key={tag}
              closeOnClick={false}
              onClick={() => cycle(tag)}
              aria-label={`${tag}: ${state}`}
            >
              {state === "include" ? <Plus /> : state === "exclude" ? <Minus /> : <span className="size-4" />}
              <span className="flex-1">{tag}</span>
              <Badge variant={state === "include" ? "default" : state === "exclude" ? "destructive" : "outline"}>{t(state)}</Badge>
            </DropdownMenuItem>
          })}
          </div> : <p className="text-xs text-muted-foreground">{t("No filters registered")}</p>}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    {active.map(({ tag, state }) => <Badge
      key={`${state}-${tag}`}
      variant={state === "include" ? "default" : "destructive"}
    >{state === "include" ? <Plus /> : <Minus />}{tag}<button type="button" aria-label={`Remove ${tag} filter`} onClick={() => setState(tag, "neutral")}><X /></button></Badge>)}
  </div>
}
