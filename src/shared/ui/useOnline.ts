import { useEffect, useState } from 'react'

/**
 * CMS-031 (#109). "Are we online?" — answered by asking the API, not the browser.
 *
 * `navigator.onLine === false` means only "not certainly online". macOS fires
 * `offline` on any interface change — a Wi-Fi switch, a VPN toggle — and is
 * unreliable about firing `online` afterwards. The previous version believed
 * it outright: one browser event put up the "Mất kết nối mạng" banner, locked
 * every write CTA and, through TanStack Query's default `networkMode`, paused
 * every query. The monitoring screen then went stale and "unavailable" while
 * the backend answered 200 in 55ms to anyone who asked. Nobody asked.
 *
 * So the browser's opinion is a *hint to go check*, never the answer:
 *
 * - offline is declared only when a same-origin probe of `/v1/health` fails at
 *   the network level — the fetch rejects, or times out;
 * - any HTTP answer at all means the network is up. A 503 from the edge is a
 *   backend problem (a different banner), and an Access redirect
 *   (`opaqueredirect`) is a session problem — both are misreported by
 *   "offline", which tells the operator to check their Wi-Fi;
 * - while offline, the probe repeats on a timer and on `online` /
 *   `visibilitychange`, so recovery does not depend on an event macOS may
 *   never send.
 *
 * One store, shared: `AppShell` reads it for the banner, and `Providers` wires
 * it into TanStack's `onlineManager` so queries pause and resume on the same
 * verified fact.
 */

const HEALTH_PATH = '/v1/health'
const PROBE_TIMEOUT_MS = 4_000
/** How often to re-check while offline. Short: an operator is watching a banner. */
const RECHECK_MS = 10_000

type Listener = (online: boolean) => void

let online = true
let recheck: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<boolean> | null = null
let listenersAttached = false
const listeners = new Set<Listener>()

/** Test seam. Production callers never touch these. */
export const reachabilityConfig = { healthPath: HEALTH_PATH, recheckMs: RECHECK_MS, timeoutMs: PROBE_TIMEOUT_MS }

function set(next: boolean): void {
  if (next === online) return
  online = next
  for (const l of listeners) l(next)
}

function scheduleRecheck(): void {
  if (recheck !== null) return
  recheck = setTimeout(() => {
    recheck = null
    void probe()
  }, reachabilityConfig.recheckMs)
}

/**
 * Network-level reachability of the API, as a single boolean. Coalesces
 * concurrent callers onto one request: five components noticing an `offline`
 * event must not fire five probes.
 */
export function probe(): Promise<boolean> {
  if (inflight) return inflight
  inflight = runProbe().finally(() => {
    inflight = null
  })
  return inflight
}

async function runProbe(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), reachabilityConfig.timeoutMs)
  let reachable: boolean
  try {
    await fetch(reachabilityConfig.healthPath, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      // Do not follow an Access login redirect off-origin: that turns into a
      // CORS failure indistinguishable from a dead network. Left manual, it
      // arrives as `opaqueredirect` — a response, so the network is up.
      redirect: 'manual',
      signal: controller.signal,
    })
    reachable = true
  } catch {
    // A rejected fetch — DNS, TCP, TLS, timeout. This is the only thing that
    // is genuinely "offline".
    reachable = false
  } finally {
    clearTimeout(timer)
  }
  set(reachable)
  if (!reachable) scheduleRecheck()
  return reachable
}

function attachBrowserListeners(): void {
  if (listenersAttached || typeof window === 'undefined') return
  listenersAttached = true
  // Both events are hints. `offline` is checked rather than believed; `online`
  // is checked rather than trusted, because a VPN coming up fires it while
  // routes are still settling.
  window.addEventListener('offline', () => void probe())
  window.addEventListener('online', () => void probe())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !online) void probe()
  })
  if (typeof navigator !== 'undefined' && navigator.onLine === false) void probe()
}

/** Current verified state. Optimistic until a probe has said otherwise. */
export function isReachable(): boolean {
  return online
}

/** Subscribe to verified-reachability changes. Returns the unsubscribe. */
export function subscribeReachability(listener: Listener): () => void {
  attachBrowserListeners()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Drives the offline banner and disables write CTAs — on verified reachability. */
export function useOnline(): boolean {
  const [state, setState] = useState(isReachable)
  useEffect(() => subscribeReachability(setState), [])
  return state
}

/** Tests only: forget everything, including attached window listeners' effect. */
export function resetReachabilityForTests(): void {
  online = true
  if (recheck !== null) clearTimeout(recheck)
  recheck = null
  inflight = null
  listeners.clear()
}
