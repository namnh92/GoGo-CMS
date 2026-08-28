import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { vi, type MessageKey } from './vi'
import { en } from './en'

export type Locale = 'vi' | 'en'

const CATALOGUES: Record<Locale, Partial<Record<MessageKey, string>>> = { vi, en }
const LOCALE_STORAGE_KEY = 'gogo.cms.locale'

/** Interpolates `{name}` placeholders. Values are already-formatted strings. */
function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}

export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string

type I18nValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translate
}

const I18nContext = createContext<I18nValue | null>(null)

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    return stored === 'en' ? 'en' : 'vi'
  } catch {
    return 'vi'
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale)

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    document.documentElement.lang = next
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next)
    } catch {
      // A locked-down browser profile is not a reason to break the app.
    }
  }, [])

  const t = useCallback<Translate>(
    (key, values) => {
      // vi is the source catalogue; en falls back to it key by key.
      const message = CATALOGUES[locale][key] ?? vi[key]
      return interpolate(message, values)
    },
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}

/** Convenience hook — the overwhelmingly common case is just `t`. */
export function useT(): Translate {
  return useI18n().t
}

/**
 * Resolve a key that is only known at runtime — a price unit, a moderation
 * state or a taxonomy kind read off the wire. Taxonomy values are stable keys
 * by contract, but the client is not the place to assume the server's enum is
 * closed: an unknown value falls back to the raw key rather than rendering a
 * blank cell or a made-up label.
 */
export function useLabel(): (key: string, fallback: string) => string {
  const { t } = useI18n()
  return useCallback(
    (key: string, fallback: string) => (key in vi ? t(key as MessageKey) : fallback),
    [t],
  )
}

export type { MessageKey }
