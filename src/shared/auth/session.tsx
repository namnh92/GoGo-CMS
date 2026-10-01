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
  /**
   * #248. True while a temporary password is outstanding. The console must
   * route to the change screen; the server enforces the obligation on every
   * other CMS route regardless.
   */
  mustChangePassword: z.boolean().default(false),
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

/**
 * Ending a staff session is a server act: the cookie and the refresh family
 * stay usable until they expire on their own unless the session id is
 * denylisted (#100). Clearing the client only hides the credential.
 *
 * The refresh retry is deliberately left on. The idle timeout fires at 30
 * minutes, long after the ~15-minute access cookie died, so the revoke almost
 * always meets a 401 — refusing to refresh there would abandon the refresh
 * family, which is the thing worth revoking. Refreshing first and revoking
 * immediately after still ends the family.
 */
let pendingRevoke: Promise<void> | null = null

function revokeServerSession(): Promise<void> {
  // apiFetch reads the bearer and the CSRF cookie synchronously, so the
  // caller may clear local state on the next line without racing this.
  const call: Promise<void> = apiFetch('/cms/auth/logout', { method: 'POST' }).then(
    () => undefined,
    // The operator asked to leave; a failed revoke must not keep them here.
    () => undefined,
  )
  pendingRevoke = call
  void call.then(() => {
    if (pendingRevoke === call) pendingRevoke = null
  })
  return call
}

type SessionValue = {
  session: SessionHint | null
  role: AdminRole | null
  /** Set once the session ended without the operator asking for it. */
  expired: ExpiryReason | null
  /** Seconds left before the idle logout, while the warning is showing. */
  idleSecondsLeft: number | null
  /** Any interaction — or the explicit CTA — pushes the deadline back. */
  keepAlive: () => void
  login: (input: LoginInput) => Promise<SessionHint & { mustChangePassword: boolean }>
  logout: () => void
  can: (permission: Permission) => boolean
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionHint | null>(readHint)
  const [expired, setExpired] = useState<ExpiryReason | null>(null)
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null)
  const lastActivityAt = useRef(Date.now())

  const clearClientSession = useCallback((reason: ExpiryReason | null) => {
    setAccessToken(null)
    writeHint(null)
    setSession(null)
    setIdleSecondsLeft(null)
    setExpired(reason)
  }, [])

  const logout = useCallback(() => {
    revokeServerSession()
    clearClientSession(null)
  }, [clearClientSession])

  const keepAlive = useCallback(() => {
    lastActivityAt.current = Date.now()
    setIdleSecondsLeft(null)
  }, [])

  // A suspended or demoted admin loses access on the very next request. The
  // client's job is to land on the login screen, not on a blank page.
  useEffect(() => {
    const onExpired = () => {
      // A 401 raised by our own sign-out is not the server throwing anyone
      // out; letting it through would tell an operator who chose to leave
      // that their session had expired.
      if (pendingRevoke) return
      // Otherwise the server already refused the credential, so there is
      // nothing left to revoke — unlike the idle path below.
      clearClientSession('unauthorized')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [clearClientSession])

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
        // Stop the clock here rather than waiting for the effect to tear down
        // on the next render, or a second tick revokes the same session twice.
        window.clearInterval(tick)
        // The shorter staff session is a server requirement, not a UI one:
        // without the revoke the cookie outlives the timeout (#100).
        revokeServerSession()
        clearClientSession('idle')
        return
      }
      setIdleSecondsLeft(remaining <= SESSION_WARN_MS ? Math.ceil(remaining / 1000) : null)
    }, 1000)

    return () => {
      for (const event of events) window.removeEventListener(event, bump)
      window.clearInterval(tick)
    }
  }, [session, clearClientSession])

  const login = useCallback(async (input: LoginInput) => {
    // A sign-out still in flight answers with cookie-clearing headers. Landing
    // after a fresh login, those would wipe the session just established, so
    // the new credential waits for the old one to finish dying.
    if (pendingRevoke) await pendingRevoke
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
    return { ...hint, mustChangePassword: parsed.mustChangePassword }
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
