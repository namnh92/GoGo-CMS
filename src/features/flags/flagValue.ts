import type { FlagValueType } from '@/shared/api/contracts'

/**
 * Turning a typed flag value into an editable string and back.
 *
 * The one thing this must never do is blur "no override" into "override set to
 * a falsy value". `false`, `0` and `''` are all real, deliberate settings, and
 * the catalog's `defaultValue` is what the key falls back to when no row
 * exists — so absence is modelled as `undefined` and nothing else.
 */
export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/

export function formatFlagValue(value: unknown, valueType: FlagValueType): string {
  if (value === undefined || value === null) return ''
  if (valueType === 'json') return JSON.stringify(value, null, 2)
  if (valueType === 'boolean') return value === true ? 'true' : 'false'
  return String(value)
}

export type ParsedFlagValue =
  { ok: true; value: unknown } | { ok: false; error: 'required' | 'number' | 'version' | 'json' }

/** Validates exactly what the server validates, so a 400 is not the first hint. */
export function parseFlagValue(raw: string, valueType: FlagValueType): ParsedFlagValue {
  if (valueType === 'boolean') return { ok: true, value: undefined }

  if (valueType === 'string') {
    // An empty string is a legitimate value for a string key — "show no
    // maintenance message" is a setting, not a blank field.
    return { ok: true, value: raw }
  }

  const trimmed = raw.trim()
  if (trimmed === '') return { ok: false, error: 'required' }

  if (valueType === 'number') {
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) return { ok: false, error: 'number' }
    return { ok: true, value: parsed }
  }

  if (valueType === 'version') {
    if (!VERSION_PATTERN.test(trimmed)) return { ok: false, error: 'version' }
    return { ok: true, value: trimmed }
  }

  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch {
    return { ok: false, error: 'json' }
  }
}

/**
 * The override that actually applies for a scope.
 *
 * A more specific row wins: an exact `(environment, platform)` match beats a
 * row scoped on one axis, which beats the unscoped `(all, all)` row. Mirrors
 * how the backend resolves, so the console shows what is really in force.
 */
export function resolveOverride<T extends { key: string; environment: string; platform: string }>(
  overrides: T[],
  key: string,
  environment: string,
  platform: string,
): T | undefined {
  const forKey = overrides.filter((row) => row.key === key)
  const score = (row: T): number => {
    if (row.environment !== 'all' && row.environment !== environment) return -1
    if (row.platform !== 'all' && row.platform !== platform) return -1
    return (row.environment === environment ? 2 : 0) + (row.platform === platform ? 1 : 0)
  }
  let best: T | undefined
  let bestScore = -1
  for (const row of forKey) {
    const rowScore = score(row)
    if (rowScore > bestScore) {
      best = row
      bestScore = rowScore
    }
  }
  return bestScore < 0 ? undefined : best
}
