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

/** Only same-origin paths survive the round trip through Access. */
export function safeReturnPath(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return undefined
  return value
}
