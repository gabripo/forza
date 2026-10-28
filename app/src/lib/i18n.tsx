import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { en } from '../locales/en'
import { it } from '../locales/it'
import type { L10n, Locale } from './types'

const dictionaries = { en, it }
type Vars = Record<string, string | number>

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict)
}

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const found = lookup(dictionaries[locale], key) ?? lookup(en, key)
  if (typeof found !== 'string') return key
  return vars ? found.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? '')) : found
}

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem('forza.locale')
    if (saved === 'en' || saved === 'it') return saved
  } catch {
    // storage unavailable: fall back to the browser language
  }
  return navigator.language.toLowerCase().startsWith('it') ? 'it' : 'en'
}

interface I18n {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, vars?: Vars) => string
  /** Picks the right language from a bilingual text. */
  l: (text: L10n | undefined | null) => string
  num: (n: number, digits?: number) => string
  date: (d: string | Date, opts?: Intl.DateTimeFormatOptions) => string
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    document.documentElement.lang = l
    try {
      localStorage.setItem('forza.locale', l)
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo<I18n>(() => {
    const tag = locale === 'it' ? 'it-IT' : 'en-GB'
    return {
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      l: (text) => (text ? text[locale] || text.en : ''),
      num: (n, digits = 0) =>
        new Intl.NumberFormat(tag, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n),
      date: (d, opts = { day: 'numeric', month: 'short' }) =>
        new Intl.DateTimeFormat(tag, opts).format(typeof d === 'string' ? new Date(d) : d),
    }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n outside I18nProvider')
  return ctx
}
