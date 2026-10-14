import * as Sentry from '@sentry/react'
import type { Breadcrumb, ErrorEvent, EventHint, RequestEventData, User } from '@sentry/react'
import { getAppEnvironment, type AppEnvironment } from '@/shared/config/env'

/**
 * GoGo-CMS#238 — the only file that talks to the Sentry SDK (pinned by
 * `sentry-usage.test.ts`). Policy: GoGo-Infra ADR-0011, adopted by
 * `docs/adr/0005-bao-cao-loi-sentry.md`; every case of the vendored oracle
 * `__fixtures__/redaction-cases.v1.json` runs in `sentry.test.ts`.
 *
 * Structural limits (nothing to pattern-match, so nothing to miss):
 * - errors only — no tracing, no replay, no release-health sessions, no
 *   user-feedback widget, `sendDefaultPii: false`;
 * - `event.request` is rebuilt from an allowlist, `event.user` is `{ id }` or
 *   absent, breadcrumbs outside a short category list are dropped — `console`
 *   included, since console text is free text nobody modelled.
 *
 * Pattern limits: every other string goes through {@link redactText}, except
 * the opaque paths (stack frames, SDK and browser contexts, release ids), which
 * the generic token rule would otherwise eat.
 */

export const REDACTED = '[redacted]'
export const REDACTED_EMAIL = '[redacted-email]'

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Lowercased, `_`/`-` stripped: `Refresh_Token`, `refreshToken` and `refresh-token` are one name. */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[_-]/g, '')
}

/** C-4 — credentials and identifiers whose value never leaves the browser. */
const SECRET_NAMES: ReadonlySet<string> = new Set(
  [
    'token',
    'inviteCode',
    'invite',
    'code',
    'slug',
    'refreshToken',
    'accessToken',
    'guestToken',
    'key',
    'signature',
    'idempotencyKey',
    'jwt',
    'assertion',
    'password',
    'email',
  ].map(normalizeName),
)

const EXACT_COORDINATE_NAME = /^(?:lat|lng|lon|latitude|longitude)$/i
/** `originLat`, `homeLongitude` — camelCase, so `flat` or `plateau` never match. */
const CAMEL_COORDINATE_SUFFIX = /[a-z0-9](?:Lat|Lng|Lon|Latitude|Longitude)$/
/** `origin_lat`, `Origin_Lat`, `start_longitude`. */
const SNAKE_COORDINATE_SUFFIX = /_(?:lat|lng|lon|latitude|longitude)$/i
/** Keys whose whole value is a position or a set of positions, whatever its shape (C-7). */
const COORDINATE_CONTAINER_NAME =
  /^(?:coordinates|bbox|bounds|viewport|latlng|ll|geom|geometry|point|origin)$/i

function isCoordinateKey(name: string): boolean {
  return (
    EXACT_COORDINATE_NAME.test(name) ||
    CAMEL_COORDINATE_SUFFIX.test(name) ||
    SNAKE_COORDINATE_SUFFIX.test(name)
  )
}

function isContainerKey(name: string): boolean {
  return COORDINATE_CONTAINER_NAME.test(name)
}

function isSecretName(name: string): boolean {
  return SECRET_NAMES.has(normalizeName(name))
}

/** A name whose value is replaced wherever it appears — key, parameter or tuple head. */
function isRedactedName(name: string): boolean {
  return isSecretName(name) || isCoordinateKey(name) || isContainerKey(name)
}

// ---------------------------------------------------------------------------
// Text — stages run in order, each on the output of the previous (ADR-0011 §4)
// ---------------------------------------------------------------------------

/** `"name": value` inside JSON text; the value is measured by {@link jsonValueEnd}. */
const JSON_KEY = /"([A-Za-z_][\w-]*)"(\s*:\s*)/g
/** `name=value` in a URL, a bare query string or free text; the value stops at a separator. */
const QUERY_PARAMETER = /(^|[?&;\s])([A-Za-z_][\w.-]*)=([^&#\s"'<>]*)/g

/**
 * The index just past the JSON value starting at `start`. An unterminated
 * array, object or string runs to the end of the text, so a cut-off value is
 * still redacted. One pass, so linear.
 */
function jsonValueEnd(text: string, start: number): number {
  const first = text[start]
  if (first === '[' || first === '{') {
    let depth = 0
    let inString = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inString) {
        if (ch === '\\') i++
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '[' || ch === '{') depth++
      else if (ch === ']' || ch === '}') {
        depth--
        if (depth === 0) return i + 1
      }
    }
    return text.length
  }
  if (first === '"') {
    for (let i = start + 1; i < text.length; i++) {
      if (text[i] === '\\') i++
      else if (text[i] === '"') return i + 1
    }
    return text.length
  }
  const scalar = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(
    text.slice(start, start + 64),
  )
  return scalar ? start + scalar[0].length : start
}

/** Stage 1a — `"refreshToken":"abc"`, `"latitude":10.7` → `"…":"[redacted]"`, so JSON text stays JSON. */
function redactJsonMembers(text: string): string {
  let out = ''
  let last = 0
  JSON_KEY.lastIndex = 0
  for (let match = JSON_KEY.exec(text); match; match = JSON_KEY.exec(text)) {
    if (!isRedactedName(match[1] ?? '')) continue
    const start = match.index + match[0].length
    const end = jsonValueEnd(text, start)
    if (end <= start || text.slice(start, end) === 'null') continue
    out += `${text.slice(last, start)}"${REDACTED}"`
    last = end
    JSON_KEY.lastIndex = end
  }
  return out + text.slice(last)
}

/** Stage 1b — `token=abc`, `lat=10.7`, `invite_code=x` → `name=[redacted]`. */
function redactNamedParameters(text: string): string {
  return text.replace(QUERY_PARAMETER, (match, lead: string, name: string) =>
    isRedactedName(name) ? `${lead}${name}=${REDACTED}` : match,
  )
}

/** Path keywords whose next segment is a credential (`/r/<code>`, `/share-links/<slug>`). */
const SEGMENT_KEYWORD = /(?:^|\/|%2F)(r|l|invite|share-links|room|rooms)(?:\/|%2F)/gi
/** `room|rooms` carry a credential only when the segment looks like one and is not a uuid. */
const ROOM_SEGMENT = /^[A-Za-z0-9_-]{6,64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The index where the path segment starting at `start` ends: `/`, `%2F`, `?`, `#`, `&`, whitespace or end. */
function segmentEnd(text: string, start: number): number {
  for (let i = start; i < text.length; i++) {
    const ch = text[i] ?? ''
    if (ch === '/' || ch === '?' || ch === '#' || ch === '&' || /\s/.test(ch)) return i
    if (ch === '%' && text[i + 1] === '2' && (text[i + 2] === 'F' || text[i + 2] === 'f')) return i
  }
  return text.length
}

function percentDecode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** Stage 2 — evaluated on the raw segment and on its percent-decoded form; either match redacts the raw span. */
function redactPathSegments(text: string): string {
  let out = ''
  let last = 0
  SEGMENT_KEYWORD.lastIndex = 0
  for (let match = SEGMENT_KEYWORD.exec(text); match; match = SEGMENT_KEYWORD.exec(text)) {
    const start = match.index + match[0].length
    const end = segmentEnd(text, start)
    // Resume on the separator, so `/r//r/x` still sees the second keyword.
    SEGMENT_KEYWORD.lastIndex = Math.max(start - 1, match.index + 1)
    if (end <= start) continue
    const raw = text.slice(start, end)
    const keyword = (match[1] ?? '').toLowerCase()
    if (keyword === 'room' || keyword === 'rooms') {
      const decoded = percentDecode(raw)
      const looksLikeCode = [raw, decoded].some(
        (form) => ROOM_SEGMENT.test(form) && !UUID.test(form),
      )
      if (!looksLikeCode) continue
    }
    if (raw === REDACTED) continue
    out += `${text.slice(last, start)}${REDACTED}`
    last = end
    SEGMENT_KEYWORD.lastIndex = end
  }
  return out + text.slice(last)
}

/**
 * The head of a WKT/EWKT geometry up to its opening parenthesis. Every
 * quantifier is bounded, so a failed attempt costs a constant; the body is
 * measured by {@link balancedEnd}.
 */
const WKT_HEAD =
  /\b(?:SRID=\d{1,10};[ \t]{0,8})?(?:MULTI)?(?:POINT|LINESTRING|POLYGON|GEOMETRYCOLLECTION)(?:[ \t]{0,8}(?:ZM|Z|M))?[ \t]{0,8}\(/gi
/** Google Maps data parameters: `!3d10.7769!4d106.7009`. */
const MAPS_DATA_POSITION = /!3d-?\d+(?:\.\d+)?!4d-?\d+(?:\.\d+)?/g
/** `10.776912,106.700981`, `@10.7769,106.7009`, `%4010.7769%2C106.7009` — three decimals or more on both sides. */
const COORDINATE_PAIR =
  /(?:(?<=%40)|(?<![\w.]))-?\d{1,3}\.\d{3,}\s{0,8}(?:,|%2C)\s{0,8}-?\d{1,3}\.\d{3,}(?![\w.])/gi

/** The index just past the `)` that closes the `(` at `open`, or `-1` when the line ends first. */
function balancedEnd(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\n') return -1
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/** `POINT(106.7 10.7)` → `[redacted]`; a geometry cut off before `)` is redacted to the end of its line. */
function redactWktGeometries(text: string): string {
  let out = ''
  let last = 0
  WKT_HEAD.lastIndex = 0
  for (let match = WKT_HEAD.exec(text); match; match = WKT_HEAD.exec(text)) {
    const open = match.index + match[0].length - 1
    const end = balancedEnd(text, open)
    const newline = text.indexOf('\n', open)
    const stop = end >= 0 ? end : newline < 0 ? text.length : newline
    out += `${text.slice(last, match.index)}${REDACTED}`
    last = stop
    WKT_HEAD.lastIndex = Math.max(stop, match.index + 1)
  }
  return out + text.slice(last)
}

/** Stage 3 — coordinate shapes. */
function redactCoordinateShapes(text: string): string {
  return redactWktGeometries(
    text.replace(MAPS_DATA_POSITION, REDACTED).replace(COORDINATE_PAIR, REDACTED),
  )
}

const BEARER = /\bBearer[ \t]+\S+/gi
const JWT = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
/** Bounded (RFC 5321 lengths) so a long run with no `@` costs a constant per position, not the run (C-16). */
const EMAIL =
  /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}(?![A-Za-z])/g
const TOKEN_RUN = /[A-Za-z0-9_-]{6,}/g

/** Stage 6 — a run of ≥ 6 with a letter and a digit that is not a uuid. */
function redactTokenRuns(text: string): string {
  return text.replace(TOKEN_RUN, (run) =>
    !UUID.test(run) && /[A-Za-z]/.test(run) && /\d/.test(run) ? REDACTED : run,
  )
}

/** Every rule of ADR-0011 §4, in its precedence order. Linear in the input (C-16). */
export function redactText(text: string): string {
  let out = redactNamedParameters(redactJsonMembers(text))
  out = redactPathSegments(out)
  out = redactCoordinateShapes(out)
  out = out.replace(BEARER, `Bearer ${REDACTED}`).replace(JWT, REDACTED)
  out = out.replace(EMAIL, REDACTED_EMAIL)
  return redactTokenRuns(out)
}

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

const MAX_DEPTH = 32

/** Root keys copied through untouched. `sdkProcessingMetadata` holds live SDK state and is never sent. */
const OPAQUE_ROOT: ReadonlySet<string> = new Set([
  'event_id',
  'timestamp',
  'release',
  'dist',
  'sdk',
  'platform',
  'environment',
  'level',
  'debug_meta',
  'modules',
  'sdkProcessingMetadata',
])
const OPAQUE_CONTEXTS: ReadonlySet<string> = new Set([
  'device',
  'os',
  'app',
  'react_native_context',
  'browser',
])
const OPAQUE_EXCEPTION_VALUE: ReadonlySet<string> = new Set(['stacktrace', 'type', 'mechanism'])
const OPAQUE_BREADCRUMB: ReadonlySet<string> = new Set(['timestamp', 'level'])

type Path = readonly (string | number)[]

/** Whether `key` under `parent` is an opaque path of ADR-0011 §4 (`[]` = any array index). */
function isOpaque(parent: Path, key: string): boolean {
  const depth = parent.length
  if (depth === 0) return OPAQUE_ROOT.has(key)
  if (depth === 1 && parent[0] === 'contexts') return OPAQUE_CONTEXTS.has(key)
  // Header values are allowlisted by name, not rewritten: `x-request-id` is what operators correlate on (C-17b).
  if (depth === 1 && parent[0] === 'request') return key === 'headers'
  if (depth === 3 && parent[0] === 'exception' && parent[1] === 'values') {
    return OPAQUE_EXCEPTION_VALUE.has(key)
  }
  if (depth === 2 && parent[0] === 'breadcrumbs') return OPAQUE_BREADCRUMB.has(key)
  return false
}

function walk(value: unknown, path: Path, ancestors: Set<object>): unknown {
  if (typeof value === 'string') return redactText(value)
  if (value === null || typeof value !== 'object') return value
  if (path.length >= MAX_DEPTH || ancestors.has(value)) return REDACTED
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (value.length === 2 && typeof value[0] === 'string' && isRedactedName(value[0])) {
        return [value[0], REDACTED]
      }
      return value.map((item, index) => walk(item, [...path, index], ancestors))
    }
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) {
      if (isOpaque(path, key)) out[key] = inner
      else if (isContainerKey(key) || isSecretName(key)) {
        out[key] = inner === null || inner === undefined ? inner : REDACTED
      } else if (isCoordinateKey(key) && (inner === null || typeof inner !== 'object')) {
        out[key] = inner === null || inner === undefined ? inner : REDACTED
      } else out[key] = walk(inner, [...path, key], ancestors)
    }
    return out
  } finally {
    ancestors.delete(value)
  }
}

/**
 * A copy of `value` with key rules applied and every string leaf through
 * {@link redactText}. Paths are read from the root, so call it on a whole
 * event to keep the opaque paths. Cycle-safe; past depth 32 the rest becomes
 * the literal.
 */
export function redactDeep<T>(value: T): T {
  return walk(value, [], new Set()) as T
}

// ---------------------------------------------------------------------------
// Request, user, breadcrumbs
// ---------------------------------------------------------------------------

/** GoGo-BE's set (`libs/observability/src/sentry.ts`); everything else is dropped. */
const REQUEST_HEADERS: ReadonlySet<string> = new Set([
  'accept',
  'accept-language',
  'content-length',
  'content-type',
  'user-agent',
  'x-request-id',
])

/** C-8 — `{ url, method, query_string, headers }` from allowlists; cookies, body, env and the rest do not exist afterwards. */
export function rebuildRequest(
  request: RequestEventData | null | undefined,
): RequestEventData | null | undefined {
  if (!request) return request
  const out: RequestEventData = {}
  if (typeof request.url === 'string') out.url = redactText(request.url)
  if (typeof request.method === 'string') out.method = request.method
  if (request.query_string !== undefined) {
    out.query_string =
      typeof request.query_string === 'string'
        ? redactText(request.query_string)
        : redactDeep(request.query_string)
  }
  if (request.headers) {
    out.headers = Object.fromEntries(
      Object.entries(request.headers).filter(([name]) => REQUEST_HEADERS.has(name.toLowerCase())),
    )
  }
  return out
}

/** C-12 — `{ id }` or nothing: no email, username, ip, segment or geo. */
export function rebuildUser(user: User | null | undefined): User | null {
  if (!user || user.id === undefined || user.id === null || user.id === '') return null
  return { id: user.id }
}

const HTTP_CATEGORIES: ReadonlySet<string> = new Set(['fetch', 'xhr', 'http'])

function pickDefined<T extends object>(source: T, keys: readonly (keyof T)[]): Partial<T> {
  const out: Partial<T> = {}
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key]
  return out
}

/** C-10/C-11 — kept categories with rebuilt `data`; every other category, `console` included, is dropped. */
export function rebuildBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = breadcrumb.category
  if (!category) return null
  const head: Breadcrumb = pickDefined(breadcrumb, ['type', 'category', 'level', 'timestamp'])
  if (typeof breadcrumb.message === 'string') head.message = redactText(breadcrumb.message)
  const data = breadcrumb.data ?? {}
  const text = (value: unknown) => (typeof value === 'string' ? redactText(value) : undefined)

  if (HTTP_CATEGORIES.has(category)) {
    return {
      ...head,
      data: pickDefined(
        { url: text(data.url), method: data.method, status_code: data.status_code },
        ['url', 'method', 'status_code'],
      ),
    }
  }
  if (category === 'navigation') {
    return {
      ...head,
      data: pickDefined({ from: text(data.from), to: text(data.to) }, ['from', 'to']),
    }
  }
  if (category === 'ui.click' || category === 'touch') return head
  if (category === 'app.lifecycle') {
    return { ...head, data: pickDefined({ state: data.state }, ['state']) }
  }
  if (category === 'device.orientation') {
    return { ...head, data: pickDefined({ orientation: data.orientation }, ['orientation']) }
  }
  return null
}

// ---------------------------------------------------------------------------
// What is not an error
// ---------------------------------------------------------------------------

/** Expected failures the UI already renders. By `name`, which our constructors set as a literal, so minification cannot break it. */
const IGNORED_NAMES: ReadonlySet<string> = new Set(['ApiError'])
/** An aborted or timed-out fetch is rethrown raw by `apiFetch` (`client.ts`). */
const IGNORED_DOM_EXCEPTIONS: ReadonlySet<string> = new Set(['AbortError', 'TimeoutError'])

export function isIgnored(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return IGNORED_DOM_EXCEPTIONS.has(error.name)
  }
  return error instanceof Error && IGNORED_NAMES.has(error.name)
}

function isIgnoredEvent(event: ErrorEvent, hint: EventHint | undefined): boolean {
  if (hint && hint.originalException !== undefined) return isIgnored(hint.originalException)
  // No original exception (a replayed event): the recorded type is all there is.
  return (event.exception?.values ?? []).some(
    (value) =>
      typeof value.type === 'string' &&
      (IGNORED_NAMES.has(value.type) || IGNORED_DOM_EXCEPTIONS.has(value.type)),
  )
}

export function beforeSend(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
  if (isIgnoredEvent(event, hint)) return null
  const { request, user, breadcrumbs, ...rest } = event
  const out = redactDeep(rest) as ErrorEvent
  const rebuiltRequest = rebuildRequest(request)
  if (rebuiltRequest) out.request = rebuiltRequest
  const rebuiltUser = rebuildUser(user)
  if (rebuiltUser) out.user = rebuiltUser
  if (breadcrumbs) {
    out.breadcrumbs = redactDeep({
      breadcrumbs: breadcrumbs
        .map(rebuildBreadcrumb)
        .filter((crumb): crumb is Breadcrumb => crumb !== null),
    }).breadcrumbs
  }
  return out
}

export function beforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  return rebuildBreadcrumb(breadcrumb)
}

// ---------------------------------------------------------------------------
// Init and the helpers the app calls
// ---------------------------------------------------------------------------

/** `https://<key>@<host>/<project>`; `http` and a port are allowed for the local envelope relay. Deploys accept https only (GoGo-Infra `check-sentry-dsn.sh`). */
const DSN = /^https?:\/\/[A-Za-z0-9]+@[A-Za-z0-9.-]+(?::\d{1,5})?\/\d+$/

export type SentryConfig = {
  dsn: string
  appEnvironment: AppEnvironment
  release: string
}

export function readSentryConfig(): SentryConfig {
  const dsn: unknown = import.meta.env.VITE_SENTRY_DSN
  const release: unknown = import.meta.env.VITE_RELEASE_SHA
  return {
    dsn: typeof dsn === 'string' ? dsn : '',
    appEnvironment: getAppEnvironment(),
    release: typeof release === 'string' && release !== '' ? release : 'local',
  }
}

/** BE vocabulary (`dev | staging | prod`), never from `import.meta.env.DEV` (BE#674). */
export function sentryEnvironment(appEnvironment: AppEnvironment): 'dev' | 'staging' | 'prod' {
  return appEnvironment === 'production' ? 'prod' : appEnvironment
}

let enabled = false

/**
 * `''` or the literal `off` → nothing initialises and every helper is a no-op.
 * Any other value must be a DSN: `OFF`, `false` or a typo throw, so a build
 * cannot switch reporting off by accident.
 */
export function initSentry(config: SentryConfig = readSentryConfig()): void {
  if (config.dsn === '' || config.dsn === 'off') {
    enabled = false
    return
  }
  if (!DSN.test(config.dsn)) throw new Error('Invalid SENTRY DSN')
  Sentry.init({
    dsn: config.dsn,
    environment: sentryEnvironment(config.appEnvironment),
    release: config.release,
    sendDefaultPii: false,
    integrations: (defaults) => [
      ...defaults.filter(
        (integration) =>
          integration.name !== 'BrowserSession' && integration.name !== 'Breadcrumbs',
      ),
      // Console is never recorded at all; `beforeBreadcrumb` would drop it anyway.
      Sentry.breadcrumbsIntegration({ console: false }),
    ],
    beforeSend,
    beforeBreadcrumb,
  })
  enabled = true
}

export type CaptureKind = 'boundary' | 'contract'

export function captureError(error: unknown, context: { kind: CaptureKind }): void {
  if (!enabled) return
  Sentry.captureException(error, { tags: { kind: context.kind } })
}

/** D-8 — a pseudonymous id or nobody. Never an email or a display name. */
export function setSentryUser(id: string | null): void {
  if (!enabled) return
  Sentry.setUser(id ? { id } : null)
}

type RootErrorHandler = (error: unknown, errorInfo: { componentStack?: string }) => void

/**
 * React 19 root callbacks. A render error caught by a route's error boundary
 * never reaches `AppErrorBoundary`, so `onCaughtError` is the only place it is
 * seen; when it is `AppErrorBoundary`, the boundary's own capture is a
 * duplicate the SDK's `Dedupe` integration drops.
 */
export function rootErrorHandlers(): {
  onUncaughtError?: RootErrorHandler
  onCaughtError?: RootErrorHandler
} {
  if (!enabled) return {}
  return { onUncaughtError: Sentry.reactErrorHandler(), onCaughtError: Sentry.reactErrorHandler() }
}

/** D-10 — a response that broke its zod schema: the path and the issue paths, never values or messages. */
export class ContractMismatchError extends Error {
  readonly path: string
  readonly issuePaths: readonly string[]

  constructor(path: string, issuePaths: readonly string[]) {
    super(`Contract mismatch on ${path}: ${issuePaths.join(', ')}`)
    this.name = 'ContractMismatchError'
    this.path = path
    this.issuePaths = issuePaths
  }
}
