import { minorUnitExponent } from '@/shared/format'

/**
 * COST-CMS-010 — the one place micros meet the form.
 *
 * The Cost API speaks micros (10⁻⁶ of the currency unit); `formatMoney`
 * speaks minor units; a person types major units. All three conversions are
 * integer arithmetic on digit strings or exact scalings — no float ever
 * holds an amount (CLAUDE.md: never compute money in floats).
 */

const MICROS_PER_UNIT = 1_000_000

/** Micros → the minor units `formatMoney` takes (USD: cents; VND: đồng). */
export function microsToMinor(micros: number, currency: string): number {
  const scale = 10 ** (6 - minorUnitExponent(currency))
  return Math.round(micros / scale)
}

/**
 * "99.99" → 99_990_000 (USD); "2500000" → 2_500_000 × 10⁶ (VND). Digits with
 * an optional `.` decimal part, no more decimals than the currency has minor
 * digits. Anything else — a thousands separator, a comma, a sign, a float
 * that would not survive `Number.MAX_SAFE_INTEGER` — is `null`, and the form
 * says so rather than guessing.
 */
export function parseAmountToMicros(text: string, currency: string): number | null {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text.trim())
  if (!match) return null
  const whole = match[1]!
  const fraction = match[2] ?? ''
  if (fraction.length > minorUnitExponent(currency)) return null
  if (whole.length > 12) return null // > 10¹² units cannot be micros in a safe integer
  const micros = Number(whole) * MICROS_PER_UNIT + Number(fraction.padEnd(6, '0'))
  return Number.isSafeInteger(micros) ? micros : null
}

/** Micros → the text a person would have typed, for the edit form's initial value. */
export function microsToAmountText(micros: number, currency: string): string {
  const exponent = minorUnitExponent(currency)
  const whole = Math.floor(micros / MICROS_PER_UNIT)
  const fraction = String(micros % MICROS_PER_UNIT)
    .padStart(6, '0')
    .slice(0, exponent)
  return exponent === 0 ? String(whole) : `${whole}.${fraction}`
}
