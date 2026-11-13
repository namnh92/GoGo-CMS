export const UNIT_SECONDS = { seconds: 1, minutes: 60, hours: 3600, days: 86400 } as const
export type DurationUnit = keyof typeof UNIT_SECONDS
export const MAX_TTL_SECONDS = 2147483647

/** The field is text; only decimal integer input is accepted, never rounded. */
export function durationSeconds(input: string, unit: DurationUnit): number | null {
  if (!/^\d+$/.test(input)) return null
  const seconds = Number(input) * UNIT_SECONDS[unit]
  return Number.isSafeInteger(seconds) && seconds >= 1 ? seconds : null
}

export function displayDuration(seconds: number): { value: string; unit: DurationUnit } {
  // The initial 86400 default is deliberately shown as 24 hours.
  const unit = seconds % 3600 === 0 ? 'hours' : seconds % 60 === 0 ? 'minutes' : 'seconds'
  return { value: String(seconds / UNIT_SECONDS[unit]), unit }
}
