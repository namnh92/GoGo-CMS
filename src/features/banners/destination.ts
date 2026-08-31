/**
 * What a banner or campaign may point at.
 *
 * The server cross-checks the destination against the type it names: an id
 * must resolve, and an `external_url` must be https, carry no credentials and
 * not point inside the network. The console cannot resolve an id — that is a
 * server read — but it can refuse the malformed URL before the round-trip, and
 * it must refuse the *shape* errors the server refuses: a value where the type
 * takes none, or none where the type requires one.
 */
export type DestinationCheck = { ok: true } | { ok: false; code: 'required' | 'forbidden' | 'url' }

/** Hosts that mean "inside the network"; an https URL to one is still unsafe. */
const INTERNAL_HOSTS = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|\[?::1\]?)/i
const INTERNAL_SUFFIX = /\.(local|internal|localdomain)$/i

export function isSafeExternalUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  // Credentials in a URL end up in logs and share sheets.
  if (url.username || url.password) return false
  if (INTERNAL_HOSTS.test(url.hostname) || INTERNAL_SUFFIX.test(url.hostname)) return false
  return true
}

/**
 * `takesNoValue` are the destination types that carry nothing — `none` for a
 * banner, `home` and `saved` for a campaign. Everything else needs a value.
 */
export function checkDestination(
  type: string,
  value: string,
  takesNoValue: readonly string[],
): DestinationCheck {
  const trimmed = value.trim()
  if (takesNoValue.includes(type)) {
    return trimmed === '' ? { ok: true } : { ok: false, code: 'forbidden' }
  }
  if (trimmed === '') return { ok: false, code: 'required' }
  if (type === 'external_url' && !isSafeExternalUrl(trimmed)) return { ok: false, code: 'url' }
  return { ok: true }
}

/**
 * A window with an end before its start is `INVALID_SCHEDULE` server-side.
 * Both ends optional: a banner with no window runs until somebody stops it.
 */
export function isValidWindow(startsAt: string, endsAt: string): boolean {
  if (!startsAt || !endsAt) return true
  return new Date(startsAt).getTime() < new Date(endsAt).getTime()
}

/**
 * `datetime-local` gives `YYYY-MM-DDTHH:mm` in the viewer's zone; the contract
 * wants ISO-8601 UTC. Empty stays empty — an absent bound is not "now".
 */
export function toIso(localValue: string): string | undefined {
  if (!localValue) return undefined
  const parsed = new Date(localValue)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

/** ISO-8601 → what `datetime-local` can display, in the viewer's zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ''
  const offset = parsed.getTimezoneOffset() * 60_000
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16)
}
