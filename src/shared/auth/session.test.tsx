import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { SessionProvider, useSession, SESSION_IDLE_MS } from './session'
import { getAccessToken } from './token'
import { server } from '@/shared/test/server'

function wrapper({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}

/** Records every `POST /cms/auth/logout` the console actually sends. */
function watchLogout(): { calls: number } {
  const seen = { calls: 0 }
  server.use(
    http.post('*/v1/cms/auth/logout', () => {
      seen.calls += 1
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return seen
}

function unauthorized() {
  return HttpResponse.json(
    { code: 'UNAUTHORIZED', message: 'no', field_errors: [], request_id: 't', retryable: false },
    { status: 401 },
  )
}

async function signIn(result: { current: ReturnType<typeof useSession> }) {
  await act(async () => {
    await result.current.login({ email: 'ops@gogo.vn', password: 'pw', totp: '123456' })
  })
}

describe('staff session', () => {
  it('keeps no credential in localStorage — only who is signed in', async () => {
    const { result } = renderHook(() => useSession(), { wrapper })

    await act(async () => {
      await result.current.login({ email: 'ops@gogo.vn', password: 'pw', totp: '123456' })
    })

    const stored = window.localStorage.getItem('gogo.cms.session-hint')
    expect(stored).not.toBeNull()
    const hint = JSON.parse(stored as string) as Record<string, unknown>
    expect(Object.keys(hint).sort()).toEqual(['displayName', 'role'])
    // The mock returns an accessToken; it must live in memory, never on disk.
    expect(getAccessToken()).toBe('mock-access-token')
    expect(stored).not.toContain('mock-access-token')
  })

  it('closes an idle session and says why', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { result } = renderHook(() => useSession(), { wrapper })

      await act(async () => {
        await result.current.login({ email: 'ops@gogo.vn', password: 'pw', totp: '123456' })
      })
      expect(result.current.session).not.toBeNull()

      await act(async () => {
        vi.advanceTimersByTime(SESSION_IDLE_MS + 1_000)
      })

      await waitFor(() => expect(result.current.session).toBeNull())
      expect(result.current.expired).toBe('idle')
      expect(getAccessToken()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('warns before the idle logout instead of ambushing the operator', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { result } = renderHook(() => useSession(), { wrapper })

      await act(async () => {
        await result.current.login({ email: 'ops@gogo.vn', password: 'pw', totp: '123456' })
      })

      await act(async () => {
        vi.advanceTimersByTime(SESSION_IDLE_MS - 60_000)
      })
      await waitFor(() => expect(result.current.idleSecondsLeft).not.toBeNull())
      expect(result.current.session).not.toBeNull()

      // The CTA pushes the deadline back rather than ending the session.
      act(() => result.current.keepAlive())
      expect(result.current.idleSecondsLeft).toBeNull()
      expect(result.current.session).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  /*
   * #100. Clearing the client only hides the credential: the cookie and the
   * refresh family stay usable until they expire unless the server denylists
   * the session id. Both ways out of a session have to say so.
   */
  it('revokes the session server-side when the operator signs out', async () => {
    const logout = watchLogout()
    const { result } = renderHook(() => useSession(), { wrapper })

    await act(async () => {
      await result.current.login({ email: 'ops@gogo.vn', password: 'pw', totp: '123456' })
    })

    await act(async () => {
      result.current.logout()
    })

    await waitFor(() => expect(logout.calls).toBe(1))
    expect(result.current.session).toBeNull()
    // An operator who asked to leave was not thrown out.
    expect(result.current.expired).toBeNull()
    expect(getAccessToken()).toBeNull()
  })

  it('revokes the session server-side when the idle timer fires', async () => {
    const logout = watchLogout()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { result } = renderHook(() => useSession(), { wrapper })

      await act(async () => {
        await result.current.login({ email: 'ops@gogo.vn', password: 'pw', totp: '123456' })
      })

      await act(async () => {
        vi.advanceTimersByTime(SESSION_IDLE_MS + 1_000)
      })

      await waitFor(() => expect(logout.calls).toBe(1))
      expect(result.current.expired).toBe('idle')
    } finally {
      vi.useRealTimers()
    }
  })

  /*
   * #100 review F-01. The idle timeout fires at 30 minutes, long after the
   * ~15-minute access cookie died, so the revoke normally meets a 401. A
   * logout that refuses to refresh there would walk away leaving the refresh
   * family alive — exactly what sign-out exists to kill.
   */
  it('refreshes once and retries when the revoke meets an expired access cookie', async () => {
    let logoutCalls = 0
    let refreshCalls = 0
    server.use(
      http.post('*/v1/cms/auth/logout', () => {
        logoutCalls += 1
        return logoutCalls === 1 ? unauthorized() : new HttpResponse(null, { status: 204 })
      }),
      http.post('*/v1/cms/auth/refresh', () => {
        refreshCalls += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { result } = renderHook(() => useSession(), { wrapper })
    await signIn(result)

    await act(async () => {
      result.current.logout()
    })

    await waitFor(() => expect(logoutCalls).toBe(2))
    expect(refreshCalls).toBe(1)
  })

  /*
   * #100 review F-03. A 401 raised by our own sign-out must not be reported
   * as the server throwing the operator out.
   */
  it('does not call a deliberate sign-out an expiry, even when the revoke 401s', async () => {
    server.use(
      http.post('*/v1/cms/auth/logout', () => unauthorized()),
      http.post('*/v1/cms/auth/refresh', () => new HttpResponse(null, { status: 401 })),
    )
    const { result } = renderHook(() => useSession(), { wrapper })
    await signIn(result)

    await act(async () => {
      result.current.logout()
    })
    await waitFor(() => expect(result.current.session).toBeNull())

    expect(result.current.expired).toBeNull()
  })

  /*
   * #100 review F-02. The revoke answers with cookie-clearing headers. Landing
   * after a fresh sign-in, they would wipe the session just established.
   */
  it('makes a new sign-in wait for the previous revoke to finish', async () => {
    const { result } = renderHook(() => useSession(), { wrapper })
    await signIn(result)

    const order: string[] = []
    let releaseLogout!: () => void
    const logoutGate = new Promise<void>((resolve) => {
      releaseLogout = resolve
    })
    server.use(
      http.post('*/v1/cms/auth/logout', async () => {
        await logoutGate
        order.push('logout')
        return new HttpResponse(null, { status: 204 })
      }),
      http.post('*/v1/cms/auth/login', () => {
        order.push('login')
        return HttpResponse.json(
          {
            accessToken: 'second-token',
            role: 'ops_admin',
            displayName: 'ops',
            expiresIn: 900,
            mustChangePassword: false,
          },
          { status: 201 },
        )
      }),
    )

    act(() => result.current.logout())
    const signedInAgain = act(async () => {
      await result.current.login({ email: 'ops@gogo.vn', password: 'pw', totp: '123456' })
    })

    // The point of the fix: while the revoke is still in flight the login
    // request must not have reached the server at all. Asserting only the
    // final order would pass by luck on whichever microtask wins.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(order).toEqual([])

    releaseLogout()
    await signedInAgain

    expect(order).toEqual(['logout', 'login'])
    expect(result.current.session).not.toBeNull()
  })
})
