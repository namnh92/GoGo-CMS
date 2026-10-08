/**
 * GoGo-BE#687 shape rev 6 — Cloudflare Access gates only `/sso` (and the
 * exchange endpoint) on `cms-<env>`; the rest of the console is public. Single
 * sign-on therefore starts with a real page load of `/sso`, so the request
 * reaches Cloudflare and Access can show its login screen. A client-side route
 * change would never leave the browser.
 *
 * A module of its own so tests can replace the page load.
 */
export function ssoRedirect(url: string): void {
  window.location.assign(url)
}

/**
 * Only a same-origin path survives the round trip through Access (review of
 * GoGo-CMS#237, F-01). Rejected before parsing: anything not starting with a
 * single `/`, and authority forms a URL parser would read as a host (`//x`,
 * `/\\x`, `\\x`). Then the value is resolved against this origin and must
 * stay on it; what comes back is the normalised path + query + hash only.
 */
export function safeReturnPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return undefined
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return undefined
  try {
    const origin = window.location.origin
    const url = new URL(value, origin)
    if (url.origin !== origin) return undefined
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return undefined
  }
}

/** The URL that starts single sign-on, carrying a validated return path. */
export function ssoStartUrl(returnTo: string | undefined): string {
  const params = new URLSearchParams({ start: '1' })
  const safe = safeReturnPath(returnTo)
  if (safe) params.set('from', safe)
  return `/sso?${params.toString()}`
}
