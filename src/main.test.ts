import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `main.tsx` is executed, not read: `bootstrap()` runs on import against mocked
 * collaborators, and the order of its calls is what is asserted (Sol #243
 * F-01/F-03). The dev-only MSW branch is switched on so the first `await` is a
 * real one — a `trackSentryRoute(router)` placed after that block would run
 * late, and this is where that shows.
 */

const wired = vi.hoisted(() => ({
  router: { state: { matches: [] }, subscribe: vi.fn() },
  handlers: { onUncaughtError: vi.fn(), onCaughtError: vi.fn() },
  initSentry: vi.fn(),
  trackSentryRoute: vi.fn(),
  rootErrorHandlers: vi.fn(),
  browserImport: vi.fn(),
  workerStart: vi.fn(),
  createRoot: vi.fn(),
  render: vi.fn(),
}))

vi.mock('@/shared/observability/sentry', () => ({
  initSentry: wired.initSentry,
  trackSentryRoute: wired.trackSentryRoute,
  rootErrorHandlers: wired.rootErrorHandlers,
}))
vi.mock('@/app/routes', () => ({ router: wired.router }))
vi.mock('@/app/Providers', () => ({ Providers: () => null }))
vi.mock('@/app/ErrorBoundary', () => ({ AppErrorBoundary: () => null }))
// The factory runs while `await import('@/shared/test/browser')` — the first
// await of bootstrap() — resolves, so its order marks that await.
vi.mock('@/shared/test/browser', () => {
  wired.browserImport()
  return { worker: { start: wired.workerStart } }
})
vi.mock('react-dom/client', () => ({ createRoot: wired.createRoot }))

function orderOf(fn: { mock: { invocationCallOrder: number[] } }): number {
  const [first] = fn.mock.invocationCallOrder
  if (first === undefined) throw new Error('never called')
  return first
}

describe('main.tsx bootstrap', () => {
  let root: HTMLElement

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    wired.rootErrorHandlers.mockReturnValue(wired.handlers)
    wired.workerStart.mockResolvedValue(undefined)
    wired.createRoot.mockReturnValue({ render: wired.render })
    root = document.createElement('div')
    root.id = 'root'
    document.body.append(root)
  })

  afterEach(() => {
    root.remove()
    vi.unstubAllEnvs()
  })

  it('starts Sentry, tracks the route, then awaits the mock worker, then renders', async () => {
    vi.stubEnv('VITE_USE_MOCK', 'true')
    expect(import.meta.env.DEV).toBe(true)

    await import('./main')
    await vi.waitFor(() => expect(wired.render).toHaveBeenCalledTimes(1))

    expect(wired.initSentry).toHaveBeenCalledTimes(1)
    expect(wired.trackSentryRoute).toHaveBeenCalledTimes(1)
    expect(wired.trackSentryRoute).toHaveBeenCalledWith(wired.router)
    expect(wired.workerStart).toHaveBeenCalledWith({ onUnhandledRequest: 'bypass' })
    expect(wired.createRoot).toHaveBeenCalledWith(root, wired.handlers)

    // initSentry → trackSentryRoute → (first await) import → worker.start → createRoot → render
    expect(orderOf(wired.initSentry)).toBeLessThan(orderOf(wired.trackSentryRoute))
    expect(orderOf(wired.trackSentryRoute)).toBeLessThan(orderOf(wired.browserImport))
    expect(orderOf(wired.browserImport)).toBeLessThan(orderOf(wired.workerStart))
    expect(orderOf(wired.workerStart)).toBeLessThan(orderOf(wired.createRoot))
    expect(orderOf(wired.createRoot)).toBeLessThan(orderOf(wired.render))
  })

  it('without the mock worker, still tracks the route before rendering', async () => {
    vi.stubEnv('VITE_USE_MOCK', 'false')

    await import('./main')
    await vi.waitFor(() => expect(wired.render).toHaveBeenCalledTimes(1))

    expect(wired.browserImport).not.toHaveBeenCalled()
    expect(wired.workerStart).not.toHaveBeenCalled()
    expect(wired.trackSentryRoute).toHaveBeenCalledWith(wired.router)
    expect(orderOf(wired.initSentry)).toBeLessThan(orderOf(wired.trackSentryRoute))
    expect(orderOf(wired.trackSentryRoute)).toBeLessThan(orderOf(wired.createRoot))
  })
})
