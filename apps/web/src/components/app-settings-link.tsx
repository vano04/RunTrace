"use client"

import Link from "next/link"
import { Settings } from "lucide-react"

import { useI18n } from "@/components/i18n-provider"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function AppSettingsLink() {
  const { t } = useI18n()

  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={t("Open app settings")} render={<Link href="/account" />} nativeButton={false} />}>
        <Settings />
      </TooltipTrigger>
      <TooltipContent>{t("App settings")}</TooltipContent>
    </Tooltip>
  )
}
