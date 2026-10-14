import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { z } from 'zod'
import { apiFetch, apiFetchParsed, SESSION_EXPIRED_EVENT } from './client'
import { ApiError } from './errors'
import { setAccessToken } from '@/shared/auth/token'
import { captureError, ContractMismatchError } from '@/shared/observability/sentry'

vi.mock('@/shared/observability/sentry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/observability/sentry')>()),
  captureError: vi.fn(),
}))

function signedInByCookie() {
  document.cookie = 'gogo_csrf=mock-csrf-token; path=/'
  // A browser session authenticates by cookie; the body token is for
  // non-browser callers, so the bearer path must not be what is tested here.
  setAccessToken(null)
}

afterEach(() => {
  vi.mocked(captureError).mockClear()
  document.cookie = 'gogo_csrf=; path=/; max-age=0'
  setAccessToken(null)
})

describe('apiFetch', () => {
  it('echoes the CSRF cookie on a mutation, which is what GoGo-BE checks', async () => {
    signedInByCookie()
    let seen: string | null = null
    server.use(
      http.post('/v1/cms/probe', ({ request }) => {
        seen = request.headers.get('x-gogo-csrf')
        return HttpResponse.json({ ok: true }, { status: 201 })
      }),
    )

    await apiFetch('/cms/probe', { method: 'POST', body: {} })
    expect(seen).toBe('mock-csrf-token')
  })

  it('sends no CSRF header on a read — the guard only checks mutations', async () => {
    signedInByCookie()
    let seen: string | null = 'unset'
    server.use(
      http.get('/v1/cms/probe', ({ request }) => {
        seen = request.headers.get('x-gogo-csrf')
        return HttpResponse.json({ ok: true })
      }),
    )

    await apiFetch('/cms/probe')
    expect(seen).toBeNull()
  })

  it('refuses a mutation without the header, the way the server does', async () => {
    signedInByCookie()
    // Proves the mock actually enforces the rule rather than waving it through:
    // a hand-crafted request skipping the header must be refused.
    const response = await fetch('/v1/cms/taxonomies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'mood', key: 'x', labels: { vi: 'X' } }),
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'CSRF_FAILED' })
  })

  it('refreshes once on 401 and replays the request', async () => {
    signedInByCookie()
    let attempts = 0
    let refreshes = 0
    server.use(
      http.get('/v1/cms/probe', () => {
        attempts += 1
        // The access cookie expiring mid-session is normal, not the end of it.
        if (attempts === 1) return HttpResponse.json({ code: 'INVALID_TOKEN' }, { status: 401 })
        return HttpResponse.json({ ok: true })
      }),
      http.post('/v1/cms/auth/refresh', () => {
        refreshes += 1
        return HttpResponse.json({ role: 'editor', displayName: 'x' }, { status: 201 })
      }),
    )

    await expect(apiFetch('/cms/probe')).resolves.toMatchObject({ ok: true })
    expect(attempts).toBe(2)
    expect(refreshes).toBe(1)
  })

  it('gives up after one failed refresh instead of looping', async () => {
    signedInByCookie()
    const expired = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, expired)
    let refreshes = 0
    server.use(
      http.get('/v1/cms/probe', () =>
        HttpResponse.json({ code: 'INVALID_TOKEN' }, { status: 401 }),
      ),
      http.post('/v1/cms/auth/refresh', () => {
        refreshes += 1
        return HttpResponse.json({ code: 'INVALID_TOKEN' }, { status: 401 })
      }),
    )

    await expect(apiFetch('/cms/probe')).rejects.toThrow()
    expect(refreshes).toBe(1)
    expect(expired).toHaveBeenCalledTimes(1)
    window.removeEventListener(SESSION_EXPIRED_EVENT, expired)
  })
})

describe('apiFetchParsed', () => {
  const PLACE_ID = '5f1c2a3e-1234-4abc-8def-0123456789ab'

  it('reports a contract mismatch with a path template and issue paths only, then throws the filtered ApiError', async () => {
    server.use(
      http.get(`/v1/cms/places/${PLACE_ID}`, () =>
        HttpResponse.json({ items: [{ name: 42 }], email: 'staff@example.com' }),
      ),
    )
    const schema = z.object({ items: z.array(z.object({ name: z.string() })), total: z.number() })

    const thrown = await apiFetchParsed(schema, `/cms/places/${PLACE_ID}`).catch(
      (error: unknown) => error,
    )

    expect(thrown).toBeInstanceOf(ApiError)
    expect((thrown as ApiError).code).toBe('CONTRACT_MISMATCH')
    expect(captureError).toHaveBeenCalledTimes(1)
    const [reported, context] = vi.mocked(captureError).mock.calls[0] ?? []
    expect(context).toEqual({ kind: 'contract' })
    expect(reported).toBeInstanceOf(ContractMismatchError)
    expect(reported).toMatchObject({
      path: '/cms/places/{id}',
      issuePaths: ['items.0.name', 'total'],
    })
    // No value and no zod message travels with it.
    expect((reported as Error).message).toBe(
      'Contract mismatch on /cms/places/{id}: items.0.name, total',
    )
  })

  it('reports nothing when the response matches', async () => {
    server.use(http.get('/v1/cms/probe', () => HttpResponse.json({ total: 1 })))
    await apiFetchParsed(z.object({ total: z.number() }), '/cms/probe')
    expect(captureError).not.toHaveBeenCalled()
  })
})
