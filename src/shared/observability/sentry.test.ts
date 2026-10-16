import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PATH_TEMPLATES } from './pathTemplates'
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

/*
 * Review round 1 of PR #239 (Sol). Not oracle rows: the oracle is canonical in
 * GoGo-Infra and changes only there (a v2 would carry these).
 */
describe('review r1 regressions', () => {
  it('F-01 ends a parameter value at `;`', () => {
    expect(sentry.redactText('page=2;password=hunter')).toBe('page=2;password=[redacted]')
  })

  it('F-02 redacts a long numeric JSON secret whole', () => {
    const long = '1'.repeat(80)
    expect(sentry.redactText(`{"code":${long},"page":2}`)).toBe('{"code":"[redacted]","page":2}')
  })

  it('F-03 matches a percent-encoded keyword segment', () => {
    expect(sentry.redactText('https://x/inv%69te/ABCDEF')).toBe('https://x/inv%69te/[redacted]')
    expect(sentry.redactText('/%72/abcdef')).toBe('/%72/[redacted]')
  })

  it('F-04 redacts coordinate shapes with long or multiline whitespace', () => {
    expect(sentry.redactText(`POINT(\n106.7009 10.7769)`)).toBe('[redacted]')
    expect(sentry.redactText(`POINT${' '.repeat(20)}(106.7009 10.7769) after`)).toBe(
      '[redacted] after',
    )
    expect(sentry.redactText(`at 10.7769${' '.repeat(20)},${' '.repeat(20)}106.7009 ok`)).toBe(
      'at [redacted] ok',
    )
  })

  it('F-05 replaces a primitive found at depth 32', () => {
    let value: unknown = 'secret-leaf'
    for (let i = 0; i < 32; i++) value = { a: value }
    let cursor = sentry.redactDeep(value) as { a: unknown }
    for (let i = 0; i < 31; i++) cursor = cursor.a as { a: unknown }
    expect(cursor.a).toBe('[redacted]')
  })

  it('F-06 stays linear on repeated eyJ without periods', () => {
    const input = 'eyJ'.repeat(34000)
    const started = performance.now()
    sentry.redactText(input)
    expect(performance.now() - started).toBeLessThanOrEqual(process.env.CI ? 1000 : 300)
  })

  it.each([
    ['POINT then newlines', `POINT${'\n'.repeat(100000)}x`],
    ['POINT Z then spaces', `POINT Z${' '.repeat(100000)}x`],
    ['keyword segments', 'inv%69te/'.repeat(11000)],
    ['pair with spaces', `1.2345${' '.repeat(50000)},${' '.repeat(50000)}y`],
  ])('F-04/F-03 scanners stay linear: %s', (_name, input) => {
    const started = performance.now()
    sentry.redactText(input)
    expect(performance.now() - started).toBeLessThanOrEqual(process.env.CI ? 1000 : 300)
  })

  it('F-07 reports a path template, not the concrete path', () => {
    expect(sentry.toPathTemplate('/cms/places/5f1c2a3e-1234-4abc-8def-0123456789ab/media')).toBe(
      '/cms/places/{placeId}/media',
    )
    expect(sentry.toPathTemplate('/cms/experiments/ranking_v2')).toBe('/cms/experiments/{key}')
    expect(sentry.toPathTemplate('/cms/ranking-configs/42/evaluate')).toBe(
      '/cms/ranking-configs/{id}/evaluate',
    )
    expect(sentry.toPathTemplate('/cms/feature-flags/catalog')).toBe('/cms/feature-flags/catalog')
  })

  it('F-08 sends no client reports', () => {
    sentry.initSentry({
      dsn: 'https://0123456789abcdef0123456789abcdef@o0.ingest.us.sentry.io/1',
      appEnvironment: 'dev',
      release: 'x',
    })
    expect(sdk.init.mock.calls[0]?.[0]).toMatchObject({ sendClientReports: false })
  })

  it.each([
    'https://k@host:99999/1',
    'https://k@/1',
    'https://k:pw@host/1',
    'https://k@host/1?x=1',
    'ftp://k@host/1',
    'https://host/1',
  ])('F-09 refuses the malformed DSN %s', (dsn) => {
    expect(() => sentry.initSentry({ dsn, appEnvironment: 'dev', release: 'x' })).toThrow(
      'Invalid SENTRY DSN',
    )
  })
})

/* Review round 2 of PR #239 (Sol confirm): F-07 still open, F-10 new. */
describe('review r2 regressions', () => {
  it('F-07 replaces a lowercase dynamic segment that is no OpenAPI route word', () => {
    expect(sentry.toPathTemplate('/cms/experiments/homepage')).toBe('/cms/experiments/{key}')
    expect(sentry.toPathTemplate('/cms/places/abc-def/media')).toBe('/cms/places/{placeId}/media')
  })

  it.each([
    ['POINTZ(106.7009 10.7769 1)', '[redacted]'],
    ['POINTM(106.7009 10.7769 1) x', '[redacted] x'],
    ['MULTIPOINTZM((106.7009 10.7769 1 2))', '[redacted]'],
    ['SRID=4326;POLYGONZ((1.123 2.123 0, 3.123 4.123 0))', '[redacted]'],
  ])('F-10 redacts compact dimensional WKT %s', (input, expected) => {
    expect(sentry.redactText(input)).toBe(expected)
  })
})

describe('PATH_TEMPLATES', () => {
  it('is exactly the paths of the vendored OpenAPI', () => {
    const yaml = readFileSync(resolve(process.cwd(), 'openapi/gogo.v1.yaml'), 'utf8')
    const paths = [...yaml.matchAll(/^ {2}(\/[^:\s]*):\s*$/gm)].map((match) => match[1])
    expect(paths.length).toBeGreaterThan(0)
    expect(PATH_TEMPLATES).toEqual(paths)
  })
})

/* SA ruling on F-07 (Fable delta check of f33d89d): match the OpenAPI path templates themselves. */
describe('F-07 SA ruling', () => {
  it.each([
    ['/cms/feature-flags/search', '/cms/feature-flags/{key}'],
    ['/cms/feature-flags/catalog', '/cms/feature-flags/catalog'],
    ['/cms/experiments/homepage', '/cms/experiments/{key}'],
    ['/cms/ranking-configs/status/rollback', '/cms/ranking-configs/{key}/rollback'],
  ])('%s → %s', (path, template) => {
    expect(sentry.toPathTemplate(path)).toBe(template)
  })

  it('falls back to positional {id} when no template matches', () => {
    expect(sentry.toPathTemplate('/cms/nowhere/abc/search')).toBe('/cms/{id}/{id}/search')
  })
})

/**
 * GoGo-CMS#241 (D-7 record addition 3) — the screen an error happened on, as a
 * route template and nothing else.
 */
describe('route tag', () => {
  const event = () =>
    ({ exception: { values: [{ type: 'TypeError', value: 'x' }] } }) as unknown as ErrorEvent
  const send = () => sentry.beforeSend(event(), { originalException: new TypeError('x') })

  type Match = { route: { path?: string } }
  function fakeRouter(matches: Match[]) {
    let listener: ((state: { matches: Match[] }) => void) | undefined
    return {
      state: { matches },
      subscribe: (fn: (state: { matches: Match[] }) => void) => {
        listener = fn
        return () => undefined
      },
      go: (next: Match[]) => listener?.({ matches: next }),
    }
  }

  it('tags the event with the route the router shows, and follows navigation', () => {
    const router = fakeRouter([
      { route: { path: '/' } },
      { route: {} },
      { route: { path: 'places' } },
    ])
    sentry.trackSentryRoute(router)
    expect(send()?.tags).toEqual({ route: '/places' })
    router.go([{ route: { path: '/' } }, { route: {} }, { route: { path: 'places/:id' } }])
    expect(send()?.tags).toEqual({ route: '/places/:id' })
  })

  it('keeps the tags the event already had', () => {
    sentry.trackSentryRoute(fakeRouter([{ route: { path: '/login' } }]))
    const tagged = { ...event(), tags: { kind: 'boundary' } } as ErrorEvent
    expect(sentry.beforeSend(tagged, { originalException: new TypeError('x') })?.tags).toEqual({
      kind: 'boundary',
      route: '/login',
    })
  })

  it('a definition that is no template clears the tag', () => {
    const router = fakeRouter([{ route: { path: '/login' } }])
    sentry.trackSentryRoute(router)
    router.go([{ route: { path: 'places/3f2504e0-4f89-11d3-9a0c-0305e82c3301' } }])
    expect(send()?.tags).toBeUndefined()
  })

  it.each([
    ['a real path with a uuid', '/places/3f2504e0-4f89-11d3-9a0c-0305e82c3301'],
    ['a numeric id', '/costs/test-runs/42'],
    ['a status code where an id belongs', '/places/403'],
    ['a query', '/places?lat=10.7'],
    ['an invite path', '/r/YDi_00PB1z4FSQZjpLbgdw'],
    ['an email', '/users/a.b@example.com'],
    ['a full URL', 'https://cms-dev.gogo.id.vn/places'],
    ['upper case or underscores', '/Places/some_slug'],
  ])('refuses %s', (_label, value) => {
    expect(sentry.asRouteTemplate(value)).toBeNull()
  })

  it('builds the template from route definitions, outermost first', () => {
    expect(
      sentry.routeTemplateOf([
        { route: { path: '/' } },
        { route: {} },
        { route: { path: 'places/:id' } },
      ]),
    ).toBe('/places/:id')
    expect(sentry.routeTemplateOf([{ route: { path: '/' } }, { route: {} }, { route: {} }])).toBe(
      '/',
    )
    expect(sentry.routeTemplateOf([{ route: { path: '/' } }, { route: { path: '*' } }])).toBe('/*')
    expect(sentry.routeTemplateOf([{ route: { path: '/' } }, { route: { path: '403' } }])).toBe(
      '/403',
    )
  })

  it('keeps a template the redaction would touch out entirely, never sends it redacted', () => {
    expect(sentry.asRouteTemplate('/r/abcdefghijklmnopqrstuv')).toBeNull()
  })
})
