import type { Locale } from '@/shared/i18n/i18n'

/**
 * Money crosses the wire as integer MINOR units plus a currency code. It is
 * never parsed into a float and never arithmetic'd in the client — the display
 * layer is the only place it becomes a string.
 */
export type Money = { amount: number; currency: string }

const MINOR_UNIT_EXPONENT: Record<string, number> = {
  VND: 0,
  JPY: 0,
  KRW: 0,
  USD: 2,
  EUR: 2,
}

export function minorUnitExponent(currency: string): number {
  return MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2
}

export function formatMoney(money: Money | null | undefined, locale: Locale): string {
  if (!money) return '—'
  const exponent = minorUnitExponent(money.currency)
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
    // Intl divides by the minor-unit scale itself; we only hand it the value.
  }).format(money.amount / 10 ** exponent)
}

/** Renders an inclusive minor-unit range, e.g. "50.000 – 120.000 ₫". */
export function formatMoneyRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string,
  locale: Locale,
): string {
  if (min == null && max == null) return '—'
  if (min != null && max != null && min !== max) {
    return `${formatMoney({ amount: min, currency }, locale)} – ${formatMoney({ amount: max, currency }, locale)}`
  }
  return formatMoney({ amount: (min ?? max) as number, currency }, locale)
}

export function formatNumber(value: number | null | undefined, locale: Locale): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN').format(value)
}

/** `value` is a ratio in 0..1 unless `alreadyPercent` is set. */
export function formatPercent(
  value: number | null | undefined,
  locale: Locale,
  options: { alreadyPercent?: boolean; digits?: number } = {},
): string {
  if (value == null || Number.isNaN(value)) return '—'
  const ratio = options.alreadyPercent ? value / 100 : value
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    style: 'percent',
    minimumFractionDigits: options.digits ?? 1,
    maximumFractionDigits: options.digits ?? 1,
  }).format(ratio)
}

/** ISO-8601 UTC in, viewer-local out. */
export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

/**
 * A date with no time of day — an effective date, not an instant.
 *
 * `formatDateTime` on a `YYYY-MM-DD` renders a midnight that the source never
 * claimed, and in a timezone west of UTC it renders the previous day.
 */
export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return formatDateTime(iso, locale)
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date)
}

export function formatTimeOnly(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    timeStyle: 'short',
  }).format(date)
}

export function formatRelative(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diffMs = then - Date.now()
  const rtf = new Intl.RelativeTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', { numeric: 'auto' })
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ]
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit)
  }
  return rtf.format(Math.round(diffMs / 1000), 'second')
}

/** Minutes-from-midnight (the wire format for opening hours) → "07:30". */
export function formatMinuteOfDay(minute: number): string {
  const safe = ((minute % 1440) + 1440) % 1440
  const hours = Math.floor(safe / 60)
  const minutes = safe % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function parseMinuteOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function formatBytes(bytes: number, locale: Locale): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${formatNumber(Math.round(value * 10) / 10, locale)} ${units[unitIndex]}`
}
