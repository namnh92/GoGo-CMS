import { builtinEnvironments, type Environment } from 'vitest/environments'

/**
 * jsdom, made to work on Node 25 and later.
 *
 * Vitest copies a jsdom key onto the global only when Node does not already
 * define it, and the jsdom `fetch` does not exist, so tests run with Node's
 * `fetch` and `Request` next to jsdom's `AbortController` and storage. Two
 * things in newer Node break that mix:
 *
 * - Node 25 added its own global `localStorage`/`sessionStorage`. Without
 *   `--localstorage-file` it is a stub (Node 25) or `undefined` (Node 26), so
 *   every `localStorage.*` call threw.
 * - Node 25's fetch checks that `signal` is a Node `AbortSignal`. jsdom's
 *   signal is rejected with "Expected signal … to be an instance of
 *   AbortSignal". The `/v1/health` probe failed, the app decided it was
 *   offline (src/shared/ui/useOnline.ts), and TanStack Query paused every
 *   query: ~530 tests waited on screens that never loaded.
 *
 * Both fixes are applied here and nowhere else. jsdom's `AbortController`
 * stays the global, because jsdom's own APIs (e.g. `addEventListener` with
 * `{ signal }`) only accept jsdom's signal. Each jsdom signal is mirrored onto
 * a Node signal right where it crosses into Node's `fetch` or `Request`.
 * Node 22, which CI runs, behaves the same with or without the bridge.
 */
const jsdom = builtinEnvironments.jsdom

type FetchInit = RequestInit | undefined

export default <Environment>{
  name: 'jsdom-node-compat',
  transformMode: 'web',
  async setup(global, options) {
    const NodeAbortController: typeof AbortController = global.AbortController
    const NodeAbortSignal: typeof AbortSignal = global.AbortSignal
    const NodeRequest: typeof Request = global.Request
    const nodeFetch: typeof fetch = global.fetch

    const env = await jsdom.setup(global, options)
    const win = global.jsdom.window as Window

    for (const key of ['localStorage', 'sessionStorage'] as const) {
      Object.defineProperty(global, key, { configurable: true, get: () => win[key] })
    }

    // Both classes share the `AbortSignal` type, so an inline `instanceof`
    // would narrow the jsdom branch to `never`.
    const isNodeSignal = (signal: AbortSignal): boolean => signal instanceof NodeAbortSignal
    const toNodeSignal = (signal: AbortSignal): AbortSignal => {
      if (isNodeSignal(signal)) return signal
      const controller = new NodeAbortController()
      if (signal.aborted) controller.abort(signal.reason)
      else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
      return controller.signal
    }
    const bridge = (init: FetchInit): FetchInit =>
      init?.signal ? { ...init, signal: toNodeSignal(init.signal) } : init

    global.Request = class extends NodeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, bridge(init))
      }
    }
    global.fetch = (input: RequestInfo | URL, init?: RequestInit) => nodeFetch(input, bridge(init))

    return {
      teardown(g) {
        g.Request = NodeRequest
        g.fetch = nodeFetch
        return env.teardown(g)
      },
    }
  },
}
