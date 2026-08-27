import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { z } from 'zod'
import { apiFetch, SESSION_EXPIRED_EVENT } from '@/shared/api/client'
import { adminRoleSchema, type AdminRole } from '@/shared/api/contracts'
import { setAccessToken } from './token'
import { roleCan, type Permission } from './permissions'

const loginResponseSchema = z.object({
  accessToken: z.string().optional(),
  role: adminRoleSchema,
  displayName: z.string().default(''),
  expiresIn: z.number().int().optional(),
})

/**
 * Non-sensitive session hint. Holds who is signed in so a reload can rebuild
 * the shell without a round trip — never a token, never anything the API
 * would accept as a credential. The cookie is the credential.
 */
const HINT_KEY = 'gogo.cms.session-hint'

const hintSchema = z.object({ role: adminRoleSchema, displayName: z.string() })
export type SessionHint = z.infer<typeof hintSchema>

function readHint(): SessionHint | null {
  try {
    const raw = window.localStorage.getItem(HINT_KEY)
    if (!raw) return null
    const parsed = hintSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function writeHint(hint: SessionHint | null): void {
  try {
    if (hint) window.localStorage.setItem(HINT_KEY, JSON.stringify(hint))
    else window.localStorage.removeItem(HINT_KEY)
  } catch {
    // Storage being unavailable must not break sign-in.
  }
}

/**
 * Staff sessions close sooner than consumer ones (workspace security rule).
 * The countdown is warned about before it fires so nobody loses a half-typed
 * moderation reason to a silent logout.
 */
export const SESSION_IDLE_MS = 30 * 60_000
export const SESSION_WARN_MS = 2 * 60_000

export type LoginInput = { email: string; password: string; totp?: string }

export type ExpiryReason = 'unauthorized' | 'idle'

type SessionValue = {
  session: SessionHint | null
  role: AdminRole | null
  /** Set once the session ended without the operator asking for it. */
  expired: ExpiryReason | null
  /** Seconds left before the idle logout, while the warning is showing. */
  idleSecondsLeft: number | null
  /** Any interaction — or the explicit CTA — pushes the deadline back. */
  keepAlive: () => void
  login: (input: LoginInput) => Promise<SessionHint>
  logout: () => void
  can: (permission: Permission) => boolean
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionHint | null>(readHint)
  const [expired, setExpired] = useState<ExpiryReason | null>(null)
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null)
  const lastActivityAt = useRef(Date.now())

  const logout = useCallback(() => {
    setAccessToken(null)
    writeHint(null)
    setSession(null)
    setIdleSecondsLeft(null)
  }, [])

  const keepAlive = useCallback(() => {
    lastActivityAt.current = Date.now()
    setIdleSecondsLeft(null)
  }, [])

  // A suspended or demoted admin loses access on the very next request. The
  // client's job is to land on the login screen, not on a blank page.
  useEffect(() => {
    const onExpired = () => {
      setAccessToken(null)
      writeHint(null)
      setSession(null)
      setIdleSecondsLeft(null)
      setExpired('unauthorized')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  // Idle countdown. Only runs while somebody is signed in, and only reads the
  // clock — no timestamp is persisted, so a reload cannot extend a session.
  useEffect(() => {
    if (!session) return
    const bump = () => {
      lastActivityAt.current = Date.now()
      setIdleSecondsLeft((current) => (current === null ? current : null))
    }
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'focus']
    for (const event of events) window.addEventListener(event, bump, { passive: true })

    const tick = window.setInterval(() => {
      const idleFor = Date.now() - lastActivityAt.current
      const remaining = SESSION_IDLE_MS - idleFor
      if (remaining <= 0) {
        setAccessToken(null)
        writeHint(null)
        setSession(null)
        setIdleSecondsLeft(null)
        setExpired('idle')
        return
      }
      setIdleSecondsLeft(remaining <= SESSION_WARN_MS ? Math.ceil(remaining / 1000) : null)
    }, 1000)

    return () => {
      for (const event of events) window.removeEventListener(event, bump)
      window.clearInterval(tick)
    }
  }, [session])

  const login = useCallback(async (input: LoginInput) => {
    const raw = await apiFetch<unknown>('/cms/auth/login', {
      method: 'POST',
      body: {
        email: input.email,
        password: input.password,
        ...(input.totp ? { totp: input.totp } : {}),
      },
    })
    const parsed = loginResponseSchema.parse(raw)
    setAccessToken(parsed.accessToken ?? null)
    const hint: SessionHint = { role: parsed.role, displayName: parsed.displayName }
    writeHint(hint)
    setSession(hint)
    setExpired(null)
    lastActivityAt.current = Date.now()
    setIdleSecondsLeft(null)
    return hint
  }, [])

  const value = useMemo<SessionValue>(
    () => ({
      session,
      role: session?.role ?? null,
      expired,
      idleSecondsLeft,
      keepAlive,
      login,
      logout,
      can: (permission) => roleCan(session?.role ?? null, permission),
    }),
    [session, expired, idleSecondsLeft, keepAlive, login, logout],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}

export function usePermission(permission: Permission): boolean {
  return useSession().can(permission)
}
