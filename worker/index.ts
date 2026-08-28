/**
 * Cloudflare Worker in front of the built CMS.
 *
 * Two jobs, and the second is the reason the Worker exists at all:
 *
 * 1. Serve the SPA from the assets binding.
 * 2. Proxy `/v1/*` to GoGo-BE **on the same origin**. The admin session is an
 *    `HttpOnly` cookie with `SameSite=Lax` (GoGo-BE ADR-0003). Calling the BFF
 *    on its own hostname would make every request cross-site: the cookie would
 *    need `SameSite=None`, which is exactly the setting CSRF protection exists
 *    to avoid. Same-origin keeps the cookie ordinary and the CSRF
 *    double-submit meaningful.
 *
 * This deployment is a preview of an internal back-office. It carries no
 * authentication of its own — GoGo-BE decides every permission — but the URL
 * must still sit behind Cloudflare Access, because an unauthenticated login
 * page for the admin console is an invitation to credential stuffing.
 */
export interface Env {
  ASSETS: Fetcher
  /** Origin of the GoGo-BE deployment this environment talks to, e.g. https://api-dev.gogo.vn */
  BE_ORIGIN?: string
}

/** Per RFC 9110 these describe a single hop and must not be forwarded. */
const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer']

function envelope(status: number, code: string, message: string): Response {
  // Same error envelope the client already knows how to render.
  return Response.json(
    { code, message, field_errors: [], request_id: 'edge', retryable: status >= 500 },
    { status },
  )
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/v1/')) return env.ASSETS.fetch(request)

    if (!env.BE_ORIGIN) {
      // Say so plainly. A silent 404 here reads as "the CMS is broken" when
      // the truth is "this environment was never told where the API is".
      return envelope(503, 'BACKEND_NOT_CONFIGURED', 'BE_ORIGIN is not set for this environment')
    }

    const target = new URL(url.pathname + url.search, env.BE_ORIGIN)
    const headers = new Headers(request.headers)
    for (const header of HOP_BY_HOP) headers.delete(header)
    headers.delete('host')

    /*
     * GoGo-BE records the staff IP on admin audit entries and rate-limits by
     * IP. Behind a proxy both would see this Worker instead of the person, so
     * the real client IP is forwarded — and GoGo-BE must set `TRUST_PROXY` for
     * this hop, otherwise it ignores the header (deliberately: trusting every
     * hop would make `req.ip` client-controlled).
     */
    const clientIp = request.headers.get('cf-connecting-ip')
    if (clientIp) headers.set('x-forwarded-for', clientIp)
    headers.set('x-forwarded-proto', url.protocol.replace(':', ''))
    headers.set('x-forwarded-host', url.host)

    const response = await fetch(
      new Request(target, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'manual',
      }),
      // An API response is per-session; caching one at the edge would serve
      // one admin's data to another.
      { cf: { cacheEverything: false, cacheTtl: 0 } },
    )

    const out = new Headers(response.headers)
    out.set('cache-control', 'no-store')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: out,
    })
  },
} satisfies ExportedHandler<Env>
