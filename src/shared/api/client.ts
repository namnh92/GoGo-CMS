import { ApiError, errorEnvelopeSchema } from './errors'
import { getAccessToken } from '@/shared/auth/token'
import type { z, ZodType } from 'zod'

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/v1'

/**
 * Fired when the API rejects the session mid-flight. The auth layer listens
 * and drops to the login screen instead of leaving a blank page behind.
 */
export const SESSION_EXPIRED_EVENT = 'gogo:session-expired'

function emitSessionExpired(): void {
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  /** Set on retryable mutations so a repeat never applies the change twice. */
  idempotencyKey?: string
  signal?: AbortSignal
  /** Skip JSON parsing — used by the CSV error-report download. */
  raw?: boolean
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE_URL}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

async function readError(response: Response): Promise<ApiError> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  const parsed = errorEnvelopeSchema.safeParse(payload)
  if (parsed.success) {
    return new ApiError({
      code: parsed.data.code,
      message: parsed.data.message,
      status: response.status,
      fieldErrors: parsed.data.field_errors,
      requestId: parsed.data.request_id,
      retryable: parsed.data.retryable,
    })
  }
  const fallbackCode =
    response.status === 401
      ? 'UNAUTHORIZED'
      : response.status === 403
        ? 'FORBIDDEN'
        : response.status === 404
          ? 'NOT_FOUND'
          : response.status === 409
            ? 'CONFLICT'
            : response.status === 429
              ? 'RATE_LIMITED'
              : 'UNKNOWN'
  return new ApiError({
    code: fallbackCode,
    message: response.statusText || fallbackCode,
    status: response.status,
    retryable: response.status >= 500 || response.status === 429,
  })
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', query, body, idempotencyKey, signal, raw } = options

  const headers = new Headers({ Accept: raw ? 'text/csv' : 'application/json' })
  let payload: BodyInit | undefined
  if (body instanceof FormData) {
    payload = body
  } else if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
    payload = JSON.stringify(body)
  }
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
  // Cookie first; the in-memory bearer only covers split-origin dev.
  const bearer = getAccessToken()
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`)

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: payload,
      // The staff session is an HttpOnly cookie. No token ever reaches JS.
      credentials: 'include',
      signal,
    })
  } catch (cause) {
    if (signal?.aborted) throw cause
    throw new ApiError({
      code: 'NETWORK',
      message: 'network unreachable',
      status: 0,
      retryable: true,
    })
  }

  if (response.status === 401) {
    emitSessionExpired()
    throw await readError(response)
  }
  if (!response.ok) throw await readError(response)
  if (response.status === 204) return undefined as T
  if (raw) return (await response.blob()) as T

  const text = await response.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

/**
 * Parse a response against a zod schema at the boundary.
 *
 * The CMS half of `openapi/gogo.v1.yaml` documents most GET responses with a
 * prose `description` and no schema, so `openapi-typescript` can only widen
 * them to `unknown`. Until GoGo-BE fills those in (tracked in
 * `docs/adr/0002-boundary-validation.md`), zod is the contract we can actually
 * enforce — and a shape drift surfaces here rather than as `undefined` deep
 * inside a table cell.
 */
export async function apiFetchParsed<S extends ZodType>(
  schema: S,
  path: string,
  options: RequestOptions = {},
): Promise<z.infer<S>> {
  const raw = await apiFetch<unknown>(path, options)
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError({
      code: 'CONTRACT_MISMATCH',
      message: `Response for ${path} did not match the expected shape: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
      status: 0,
      retryable: false,
    })
  }
  return parsed.data
}
