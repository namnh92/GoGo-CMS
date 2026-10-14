import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Breadcrumb, ErrorEvent, RequestEventData, User } from '@sentry/react'

/*
 * GoGo-CMS#238 — every case of the vendored ADR-0011 oracle, table-driven.
 * A case that cannot pass as written goes back to the shape; it is never
 * skipped or weakened here. `perf` rows run in `sentry-perf.test.ts`.
 */

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  setUser: vi.fn(),
  breadcrumbsIntegration: vi.fn(() => ({ name: 'Breadcrumbs' })),
  reactErrorHandler: vi.fn(() => () => undefined),
}))
vi.mock('@sentry/react', () => sdk)

type Sentry = typeof import('./sentry')

const FIXTURE = resolve(__dirname, '__fixtures__/redaction-cases.v1.json')
/** ADR-0005 pins this digest; it must equal GoGo-Infra `docs/adr/0011/redaction-cases.v1.json`. */
const PINNED_SHA256 = 'decf6c4336269b086b209a4d27a9c36ca2c392b307c9d76e4b24883a4f4ef6a0'

type Construct =
  | { kind: 'cycle' }
  | { kind: 'nest'; depth: number; leaf: string }
  | { kind: 'repeat'; unit: string; size: number; prefix?: string; suffix?: string }

type Case = {
  id: string
  surface: 'text' | 'deep' | 'request' | 'breadcrumb' | 'user' | 'filter' | 'init' | 'perf'
  input?: unknown
  construct?: Construct
  expected: unknown
  platforms?: string[]
}

const raw = readFileSync(FIXTURE)
const oracle = JSON.parse(raw.toString('utf8')) as { version: number; cases: Case[] }
const cases = oracle.cases.filter((c) => !c.platforms || c.platforms.includes('cms'))
const bySurface = (surface: Case['surface']) => cases.filter((c) => c.surface === surface)

function build(construct: Construct): unknown {
  if (construct.kind === 'cycle') {
    const o: { self: unknown } = { self: null }
    o.self = o
    return o
  }
  if (construct.kind === 'nest') {
    let value: unknown = construct.leaf
    for (let i = 0; i < construct.depth; i++) value = { a: value }
    return value
  }
  throw new Error(`construct ${construct.kind} belongs to the perf spec`)
}

let sentry: Sentry
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  sentry = await import('./sentry')
})

describe('vendored oracle', () => {
  it('is redaction-cases v1 with the pinned digest', () => {
    expect(oracle.version).toBe(1)
    expect(createHash('sha256').update(raw).digest('hex')).toBe(PINNED_SHA256)
  })

  it('has a runner for every surface it contains', () => {
    const known = ['text', 'deep', 'request', 'breadcrumb', 'user', 'filter', 'init', 'perf']
    expect(oracle.cases.every((c) => known.includes(c.surface))).toBe(true)
  })
})

describe('redactText (oracle)', () => {
  it.each(bySurface('text').map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(sentry.redactText(c.input as string)).toBe(c.expected)
  })
})

describe('redactDeep (oracle)', () => {
  it.each(bySurface('deep').map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const input = c.construct ? build(c.construct) : c.input
    expect(sentry.redactDeep(input)).toEqual(c.expected)
  })
})

describe('rebuildRequest (oracle)', () => {
  it.each(bySurface('request').map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(sentry.rebuildRequest(c.input as RequestEventData | null)).toEqual(c.expected)
  })
})

describe('rebuildBreadcrumb (oracle)', () => {
  it.each(bySurface('breadcrumb').map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(sentry.rebuildBreadcrumb(c.input as Breadcrumb)).toEqual(c.expected)
    expect(sentry.beforeBreadcrumb(c.input as Breadcrumb)).toEqual(c.expected)
  })
})

describe('rebuildUser (oracle)', () => {
  it.each(bySurface('user').map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(sentry.rebuildUser(c.input as User | null)).toEqual(c.expected)
    const event = { event_id: 'e', ...(c.input ? { user: c.input } : {}) } as ErrorEvent
    const sent = sentry.beforeSend(event, { originalException: new Error('x') })
    if (c.expected === null) expect(sent).not.toHaveProperty('user')
    else expect(sent?.user).toEqual(c.expected)
  })
})

type FilterInput = {
  name: string
  message?: string
  domException?: boolean
  minifiedClass?: string
}

function makeError(input: FilterInput): unknown {
  if (input.domException) return new DOMException(input.message ?? 'x', input.name)
  if (input.minifiedClass) {
    // A minifier renames the class; the name our constructor sets survives.
    const Minified = class extends Error {
      constructor() {
        super(input.message ?? 'x')
        this.name = input.name
      }
    }
    Object.defineProperty(Minified, 'name', { value: input.minifiedClass })
    return new Minified()
  }
  if (input.name === 'TypeError') return new TypeError(input.message ?? 'x')
  if (input.name === 'RangeError') return new RangeError(input.message ?? 'x')
  const error = new Error(input.message ?? 'x')
  error.name = input.name
  return error
}

describe('beforeSend filter (oracle, cms rows)', () => {
  it.each(bySurface('filter').map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const error = makeError(c.input as FilterInput)
    const event = { exception: { values: [{ type: (c.input as FilterInput).name }] } } as ErrorEvent
    const sent = sentry.beforeSend(event, { originalException: error })
    if (c.expected === 'drop') expect(sent).toBeNull()
    else expect(sent).not.toBeNull()
  })

  it('falls back to the recorded exception type when there is no original exception', () => {
    const event = { exception: { values: [{ type: 'ApiError' }] } } as ErrorEvent
    expect(sentry.beforeSend(event, {})).toBeNull()
    const kept = { exception: { values: [{ type: 'TypeError' }] } } as ErrorEvent
    expect(sentry.beforeSend(kept, {})).not.toBeNull()
  })
})

type InitExpected = {
  init?: boolean
  initCalls?: number
  sendDefaultPii?: boolean
  tracesSampleRate?: 'absent'
  captureErrorCallsSdk?: boolean
  setSentryUserCallsSdk?: boolean
  helpersThrow?: boolean
  throws?: boolean
}

describe('initSentry (oracle)', () => {
  it.each(bySurface('init').map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const dsn = (c.input as { dsn: string }).dsn
    const expected = c.expected as InitExpected
    const config = { dsn, appEnvironment: 'dev' as const, release: 'abc' }
    if (expected.throws) {
      expect(() => sentry.initSentry(config)).toThrow('Invalid SENTRY DSN')
      expect(sdk.init).not.toHaveBeenCalled()
      return
    }
    sentry.initSentry(config)
    if (expected.init === false) {
      expect(sdk.init).not.toHaveBeenCalled()
      expect(() => {
        sentry.captureError(new Error('x'), { kind: 'boundary' })
        sentry.setSentryUser('u1')
        sentry.setSentryUser(null)
      }).not.toThrow()
      expect(sdk.captureException).not.toHaveBeenCalled()
      expect(sdk.setUser).not.toHaveBeenCalled()
      expect(sentry.rootErrorHandlers()).toEqual({})
      return
    }
    expect(sdk.init).toHaveBeenCalledTimes(expected.initCalls ?? 1)
    const options = sdk.init.mock.calls[0]?.[0] as Record<string, unknown>
    expect(options.sendDefaultPii).toBe(false)
    expect(options).not.toHaveProperty('tracesSampleRate')
  })
})

describe('init options beyond the oracle', () => {
  const dsn = 'https://0123456789abcdef0123456789abcdef@o0.ingest.us.sentry.io/1'

  it.each([
    ['dev', 'dev'],
    ['staging', 'staging'],
    ['production', 'prod'],
  ] as const)('VITE_APP_ENV %s reports environment %s', (appEnvironment, environment) => {
    sentry.initSentry({ dsn, appEnvironment, release: 'abc123' })
    expect(sdk.init.mock.calls[0]?.[0]).toMatchObject({ environment, release: 'abc123' })
  })

  it('takes the release from VITE_RELEASE_SHA, else local', () => {
    vi.stubEnv('VITE_RELEASE_SHA', '')
    expect(sentry.readSentryConfig().release).toBe('local')
    vi.stubEnv('VITE_RELEASE_SHA', 'f'.repeat(40))
    expect(sentry.readSentryConfig().release).toBe('f'.repeat(40))
    vi.unstubAllEnvs()
  })

  it('accepts the local relay DSN (http, port)', () => {
    sentry.initSentry({ dsn: 'http://k@127.0.0.1:8096/1', appEnvironment: 'dev', release: 'x' })
    expect(sdk.init).toHaveBeenCalledTimes(1)
  })

  it('drops release-health sessions and console breadcrumbs, adds no tracing or replay', () => {
    sentry.initSentry({ dsn, appEnvironment: 'dev', release: 'x' })
    const options = sdk.init.mock.calls[0]?.[0] as {
      integrations: (defaults: { name: string }[]) => { name: string }[]
    }
    const names = options.integrations([
      { name: 'InboundFilters' },
      { name: 'Breadcrumbs' },
      { name: 'BrowserSession' },
      { name: 'Dedupe' },
      { name: 'HttpContext' },
    ])
    expect(names.map((i) => i.name)).toEqual([
      'InboundFilters',
      'Dedupe',
      'HttpContext',
      'Breadcrumbs',
    ])
    expect(sdk.breadcrumbsIntegration).toHaveBeenCalledWith({ console: false })
    expect(options).not.toHaveProperty('replaysSessionSampleRate')
    expect(options).not.toHaveProperty('profilesSampleRate')
  })

  it('tags captures with their kind and sets only a pseudonymous id', () => {
    sentry.initSentry({ dsn, appEnvironment: 'dev', release: 'x' })
    const error = new Error('x')
    sentry.captureError(error, { kind: 'contract' })
    expect(sdk.captureException).toHaveBeenCalledWith(error, { tags: { kind: 'contract' } })
    sentry.setSentryUser('u1')
    sentry.setSentryUser(null)
    expect(sdk.setUser.mock.calls).toEqual([[{ id: 'u1' }], [null]])
  })
})

describe('beforeSend end to end', () => {
  it('rebuilds request and breadcrumbs, keeps x-request-id and opaque paths, redacts the rest', () => {
    const event = {
      event_id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      release: 'f00d1234',
      message: 'staff a.b@example.com hit /r/YDi_00PB1z4FSQZjpLbgdw',
      request: {
        url: 'https://cms-dev.gogo.id.vn/places?lat=10.7769',
        headers: {
          'X-Request-Id': 'req_01HZX8K2V9M4',
          Referer: 'https://cms-dev.gogo.id.vn/r/x',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)',
        },
        cookies: { gogo_csrf: 't' },
      },
      user: { id: 'u1', email: 'a.b@example.com', ip_address: '1.2.3.4' },
      breadcrumbs: [
        { category: 'console', message: 'invite /r/SENTINEL', timestamp: 1 },
        {
          category: 'fetch',
          level: 'info',
          timestamp: 2,
          data: { url: '/v1/share-links/abc1234', method: 'GET', status_code: 404, body: 'x' },
        },
      ],
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'bad lat=10.7769 for x@y.co',
            stacktrace: { frames: [{ function: 'a1b2c3' }] },
          },
        ],
      },
      contexts: { browser: { version: 'chrome129' }, trace: { trace_id: 'abc' } },
    } as unknown as ErrorEvent

    const sent = sentry.beforeSend(event, { originalException: new TypeError('x') })

    expect(sent).toEqual({
      event_id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      release: 'f00d1234',
      message: 'staff [redacted-email] hit /r/[redacted]',
      request: {
        url: 'https://cms-dev.gogo.id.vn/places?lat=[redacted]',
        headers: {
          'X-Request-Id': 'req_01HZX8K2V9M4',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)',
        },
      },
      user: { id: 'u1' },
      breadcrumbs: [
        {
          category: 'fetch',
          level: 'info',
          timestamp: 2,
          data: { url: '/v1/share-links/[redacted]', method: 'GET', status_code: 404 },
        },
      ],
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'bad lat=[redacted] for [redacted-email]',
            stacktrace: { frames: [{ function: 'a1b2c3' }] },
          },
        ],
      },
      contexts: { browser: { version: 'chrome129' }, trace: { trace_id: 'abc' } },
    })
  })
})

describe('ContractMismatchError', () => {
  it('carries the path and issue paths only, under a literal name', () => {
    const error = new sentry.ContractMismatchError('/cms/places', ['items.0.name', 'cursor'])
    expect(error.name).toBe('ContractMismatchError')
    expect(error.message).toBe('Contract mismatch on /cms/places: items.0.name, cursor')
    expect(sentry.isIgnored(error)).toBe(false)
  })
})
