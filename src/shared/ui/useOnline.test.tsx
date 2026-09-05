import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { probe, reachabilityConfig, resetReachabilityForTests, useOnline } from './useOnline'

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
}

describe('CMS-031 — offline is verified against the API, not read off the browser', () => {
  beforeEach(() => {
    resetReachabilityForTests()
    reachabilityConfig.recheckMs = 30
    setNavigatorOnline(true)
  })
  afterEach(() => {
    reachabilityConfig.recheckMs = 10_000
    vi.unstubAllGlobals()
  })

  it('stays online when navigator says offline but the API answers', async () => {
    // The exact production failure: macOS fires `offline` on an interface
    // change; the backend is answering 200 in 55ms. The banner must not appear.
    setNavigatorOnline(false)
    const { result } = renderHook(() => useOnline())
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
      await probe()
    })
    expect(result.current).toBe(true)
  })

  it('goes offline only when the probe itself fails at the network level', async () => {
    server.use(http.get('/v1/health', () => HttpResponse.error()))
    const { result } = renderHook(() => useOnline())
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
      await probe()
    })
    expect(result.current).toBe(false)
  })

  it('recovers on its own once the API answers again — no `online` event needed', async () => {
    server.use(http.get('/v1/health', () => HttpResponse.error()))
    const { result } = renderHook(() => useOnline())
    await act(async () => {
      await probe()
    })
    expect(result.current).toBe(false)
    // Network is back. The browser says nothing. The re-check timer notices.
    server.resetHandlers()
    await waitFor(() => expect(result.current).toBe(true), { timeout: 2_000 })
  })

  it('treats an Access login redirect as a session problem, not a dead network', async () => {
    // fetch with redirect: 'manual' yields an opaqueredirect response — an
    // *answer*. Calling that "offline" sends the operator to check their Wi-Fi
    // when what they need is to sign in again.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ type: 'opaqueredirect', status: 0, ok: false }) as unknown as Response),
    )
    const { result } = renderHook(() => useOnline())
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
      await probe()
    })
    expect(result.current).toBe(true)
  })

  it('coalesces concurrent probes into one request', async () => {
    let calls = 0
    server.use(
      http.get('/v1/health', async () => {
        calls += 1
        await new Promise((r) => setTimeout(r, 20))
        return HttpResponse.json({ status: 'ok' })
      }),
    )
    await Promise.all([probe(), probe(), probe()])
    expect(calls).toBe(1)
  })
})
