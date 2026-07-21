"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { defaultLocale, type Locale } from "@/i18n/config"
import german from "@/i18n/messages/de"
import english from "@/i18n/messages/en"
import spanish from "@/i18n/messages/es"
import french from "@/i18n/messages/fr"
import hindi from "@/i18n/messages/hi"
import japanese from "@/i18n/messages/ja"
import korean from "@/i18n/messages/ko"
import brazilianPortuguese from "@/i18n/messages/pt-BR"
import russian from "@/i18n/messages/ru"
import simplifiedChinese from "@/i18n/messages/zh-Hans"
import traditionalChinese from "@/i18n/messages/zh-Hant"

type MessageKey = keyof typeof english
type MessageValues = Record<string, string | number>
type RichMessageValues = Record<string, ReactNode>

const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  en: english,
  "zh-Hans": simplifiedChinese,
  "zh-Hant": traditionalChinese,
  es: spanish,
  "pt-BR": brazilianPortuguese,
  fr: french,
  de: german,
  ja: japanese,
  ko: korean,
  ru: russian,
  hi: hindi,
}

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, values?: MessageValues) => string
  rich: (key: MessageKey, values: RichMessageValues) => ReactNode[]
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const t = useCallback((key: MessageKey, values?: MessageValues) => {
    const message = dictionaries[locale][key] ?? dictionaries[defaultLocale][key]
    if (!values) return message
    return message.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match))
  }, [locale])

  const rich = useCallback((key: MessageKey, values: RichMessageValues) => {
    const message = dictionaries[locale][key] ?? dictionaries[defaultLocale][key]
    return message.split(/(\{\w+\})/g).filter(Boolean).map((part, index) => {
      const match = /^\{(\w+)\}$/.exec(part)
      return match && match[1] in values ? <span key={`${match[1]}-${index}`} className="contents">{values[match[1]]}</span> : part
    })
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale, t, rich }), [locale, rich, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error("useI18n must be used within I18nProvider")
  return value
}
