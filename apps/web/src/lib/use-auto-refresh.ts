"use client"

import { useEffect, useRef } from "react"

const DEFAULT_REFRESH_INTERVAL_MS = 2_000

export function useAutoRefresh(refresh: () => Promise<unknown> | void, intervalMs = DEFAULT_REFRESH_INTERVAL_MS) {
  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    let refreshing = false

    const run = async () => {
      if (refreshing || document.visibilityState === "hidden") return
      refreshing = true
      try {
        await refreshRef.current()
      } finally {
        refreshing = false
      }
    }

    const timer = window.setInterval(run, intervalMs)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void run()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("focus", run)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("focus", run)
    }
  }, [intervalMs])
}
