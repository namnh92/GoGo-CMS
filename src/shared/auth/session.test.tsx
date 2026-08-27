import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SessionProvider, useSession, SESSION_IDLE_MS } from './session'
import { getAccessToken } from './token'

function wrapper({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
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
})
