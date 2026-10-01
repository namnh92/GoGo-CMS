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
})
