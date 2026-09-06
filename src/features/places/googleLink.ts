/**
 * GoGo-CMS#126 — recognising a Google Maps link, and being honest about the
 * difference between recognising one and resolving it.
 *
 * **Recognising** is reading the URL: is this a Google Maps host, and does the
 * link carry a Place ID, a coordinate or a name? That is string work, it costs
 * nothing, and doing it in the browser gives an editor an answer as they
 * paste. It is input validation, not a provider call.
 *
 * **Resolving** is deciding which Google Place a link names — expanding a
 * `maps.app.goo.gl` short link through its redirect, or searching for a name.
 * That is server work: it needs an SSRF-safe redirect follower, and for a name
 * it needs the Places API. `PlaceResolverService.identifyUrl()` on GoGo-BE does
 * exactly this, and **no CMS route exposes it**. So a short link is reported as
 * a short link and not guessed at.
 *
 * The host allowlist and the identifier rules below mirror
 * `GoGo-BE/libs/providers/src/maps-url.ts` deliberately, so the console's
 * verdict and the server's cannot disagree about what a link is. They are
 * copied rather than shared because the two repos share no code — which is
 * also why `googleLink.test.ts` pins the cases that matter.
 */

/** Mirrors `ALLOWED_HOSTS` in GoGo-BE's `maps-url.ts`. */
const ALLOWED_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'www.google.com',
  'google.com',
  'www.google.com.vn',
  'google.com.vn',
])

export type GoogleLinkReading =
  | { kind: 'empty' }
  /** Not a URL at all. */
  | { kind: 'invalid' }
  /** A URL, but not a Google Maps one. */
  | { kind: 'foreign_host'; host: string }
  /** Carries a Place ID outright — the one case that needs no server at all. */
  | { kind: 'place_id'; placeId: string; normalizedUrl: string }
  /** A short link. Only the server can expand it, and no CMS route does. */
  | { kind: 'short_link'; normalizedUrl: string }
  /** A long link naming a place by text and/or coordinates, with no id. */
  | {
      kind: 'hints'
      query?: string | undefined
      lat?: number | undefined
      lng?: number | undefined
      normalizedUrl: string
    }

/**
 * `place_id`, `placeid` and `query_place_id` are all forms Google's own share
 * links use; reading only the first threw away an authoritative id and sent it
 * down the fuzzy path (GoGo-BE#311).
 */
function readPlaceId(url: URL): string | undefined {
  const raw =
    url.searchParams.get('place_id') ??
    url.searchParams.get('placeid') ??
    url.searchParams.get('query_place_id')
  return raw && /^[\w-]{6,255}$/.test(raw) ? raw : undefined
}

function readHints(url: URL): { query?: string; lat?: number; lng?: number } {
  const out: { query?: string; lat?: number; lng?: number } = {}

  const nameMatch = /\/maps\/place\/([^/@]+)/.exec(url.pathname)
  if (nameMatch?.[1]) {
    out.query = decodeURIComponent(nameMatch[1]).replace(/\+/g, ' ').trim()
  } else {
    const q = url.searchParams.get('q') ?? url.searchParams.get('query')
    if (q) {
      const coord = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(q.trim())
      if (coord) {
        out.lat = Number(coord[1])
        out.lng = Number(coord[2])
      } else {
        out.query = q.trim()
      }
    }
  }

  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url.pathname + url.search)
  if (at) {
    out.lat = Number(at[1])
    out.lng = Number(at[2])
  }
  return out
}

export function readGoogleLink(input: string): GoogleLinkReading {
  const trimmed = input.trim()
  if (trimmed === '') return { kind: 'empty' }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { kind: 'invalid' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'invalid' }

  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!ALLOWED_HOSTS.has(host)) return { kind: 'foreign_host', host }

  const normalizedUrl = url.toString()
  const placeId = readPlaceId(url)
  if (placeId) return { kind: 'place_id', placeId, normalizedUrl }

  const isShort =
    host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps'))
  if (isShort) return { kind: 'short_link', normalizedUrl }

  return { kind: 'hints', ...readHints(url), normalizedUrl }
}

/**
 * How a pasted link stands against the Google identity the place already
 * holds.
 *
 * This is the whole deliverable of #126 that does not need a policy decision:
 * a Place ID is an *identifier*, not content, and ADR-0006 §9.3 permits storing
 * one indefinitely. Comparing two of them is arithmetic on values GoGo already
 * has.
 */
export type IdentityComparison =
  | { kind: 'same' }
  | { kind: 'different'; stored: string; pasted: string }
  | { kind: 'place_has_none'; pasted: string }
  | { kind: 'unknown' }

export function compareIdentity(
  reading: GoogleLinkReading,
  storedExternalId: string | null | undefined,
): IdentityComparison {
  if (reading.kind !== 'place_id') return { kind: 'unknown' }
  if (!storedExternalId) return { kind: 'place_has_none', pasted: reading.placeId }
  return storedExternalId === reading.placeId
    ? { kind: 'same' }
    : { kind: 'different', stored: storedExternalId, pasted: reading.placeId }
}
