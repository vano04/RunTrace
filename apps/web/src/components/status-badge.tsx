"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useI18n } from "@/components/i18n-provider"

const styles: Record<string, string> = {
  proposed: "border-status-proposed/30 bg-status-proposed/8 text-status-proposed",
  pending: "border-status-pending/30 bg-status-pending/8 text-status-pending",
  running: "border-status-running/30 bg-status-running/8 text-status-running",
  completed: "border-status-neutral/30 bg-status-neutral/8 text-status-neutral",
  crashed: "border-status-crashed/30 bg-status-crashed/8 text-status-crashed",
  kept: "border-status-kept/30 bg-status-kept/8 text-status-kept",
  discarded: "border-status-neutral/30 bg-status-neutral/8 text-status-neutral",
  undecided: "border-status-neutral/30 bg-background text-status-neutral",
}

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const { t } = useI18n()
  const translated = value in styles ? t(value as keyof typeof styles & Parameters<typeof t>[0]) : value
  return <Badge variant="outline" className={cn("capitalize", styles[value], className)}>{translated}</Badge>
}
