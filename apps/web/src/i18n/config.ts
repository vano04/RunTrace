export const supportedLocales = [
  "en",
  "zh-Hans",
  "zh-Hant",
  "es",
  "pt-BR",
  "fr",
  "de",
  "ja",
  "ko",
  "ru",
  "hi",
] as const

export type Locale = (typeof supportedLocales)[number]

export const defaultLocale: Locale = "en"

export const localeNames: Record<Locale, string> = {
  en: "English",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  es: "Español",
  "pt-BR": "Português (Brasil)",
  fr: "Français",
  de: "Deutsch",
  ja: "日本語",
  ko: "한국어",
  ru: "Русский",
  hi: "हिन्दी",
}

export function isLocale(value: string): value is Locale {
  return supportedLocales.includes(value as Locale)
}
