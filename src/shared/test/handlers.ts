import { http, HttpResponse } from 'msw'
import type { AdminRole, CollectionStatus, PlaceStatus } from '@/shared/api/contracts'
import type { ImportRow } from '@/shared/api/contracts-import'
import {
  auditEntries,
  collectionItems,
  collections,
  decidedSubmissions,
  duplicateRows,
  featureFlags,
  importJobs,
  importRows,
  moderationQueue,
  opsKpis,
  experiments,
  placeSubmissions,
  places,
  rankingConfigs,
  rankingEvaluation,
  searchAnalytics,
  taxonomies,
  moderationReviewQueue,
} from './fixtures'

const BASE = '/v1'

const MOCK_CSRF = 'mock-csrf-token'
const CSRF_COOKIE = 'gogo_csrf'
const CSRF_HEADER = 'x-gogo-csrf'
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * The mock enforces the double-submit rule GoGo-BE's `AuthGuard` enforces
 * (ADR-0003): a cookie-authenticated mutation without a matching
 * `x-gogo-csrf` header is refused. Leaving it out here would let the client
 * pass every test and then fail every write against a real backend — which is
 * exactly what happened before this handler existed.
 */
function csrfFailure(request: Request, cookies: Record<string, string>) {
  if (!MUTATING.has(request.method)) return null
  const cookie = cookies[CSRF_COOKIE]
  // No cookie means a non-browser caller on the bearer path; the guard does
  // not ask those for a CSRF token either.
  if (!cookie) return null
  if (request.headers.get(CSRF_HEADER) !== cookie) {
    return envelope(403, 'CSRF_FAILED', 'Missing or invalid CSRF token')
  }
  return null
}

/**
 * Mutable copies so the mocked CMS behaves like a real one: a toggle stays
 * toggled, a merged duplicate leaves the queue, a published row moves state.
 */
const db = {
  places: places.map((place) => ({ ...place })),
  taxonomies: taxonomies.map((item) => ({ ...item })),
  collections: collections.map((item) => ({ ...item })),
  flags: featureFlags.map((flag) => ({ ...flag })),
  configs: rankingConfigs.map((config) => ({ ...config })),
  jobs: importJobs.map((job) => ({ ...job })),
  rows: JSON.parse(JSON.stringify(importRows)) as Record<string, ImportRow[]>,
  duplicates: duplicateRows.map((row) => ({ ...row })),
  moderation: JSON.parse(JSON.stringify(moderationQueue)) as typeof moderationQueue,
  reviewQueue: JSON.parse(JSON.stringify(moderationReviewQueue)) as typeof moderationReviewQueue,
  submissions: placeSubmissions.map((item) => ({ ...item })),
  experiments: experiments.map((item) => ({ ...item })),
  items: JSON.parse(JSON.stringify(collectionItems)) as typeof collectionItems,
  decidedSubmissions: decidedSubmissions.map((item) => ({ ...item })),
  /** Counts break-glass calls so the burst limit is reachable in dev. */
  takedowns: 0,
  /** Audit entries written during this session, newest first. */
  audit: [] as (typeof auditEntries)[number][],
  /** Emails already taken, so the duplicate branch of admin creation is reachable. */
  adminEmails: ['boss@gogo.vn', 'ops@gogo.vn', 'editor@gogo.vn', 'moderator@gogo.vn'],
}

/**
 * What login and refresh set. `gogo_csrf` is deliberately readable — it is the
 * value the client echoes back in the double-submit header.
 */
function sessionCookies(): Headers {
  const headers = new Headers()
  headers.append('Set-Cookie', 'gogo_at=mock-access-token; Path=/; SameSite=Lax')
  headers.append('Set-Cookie', `gogo_csrf=${MOCK_CSRF}; Path=/; SameSite=Lax`)
  return headers
}

function envelope(status: number, code: string, message: string) {
  return HttpResponse.json(
    {
      code,
      message,
      field_errors: [],
      request_id: `mock-${code.toLowerCase()}`,
      retryable: status >= 500,
    },
    { status },
  )
}

/*
 * The mocked signed-in admin. Set at login so the mock can behave the way the
 * server does about *who* is asking: staff IP is only returned to ops_admin and
 * above, and four-eyes refuses the account that drafted a config.
 */
let mockRole: AdminRole = 'super_admin'
let mockDisplayName = 'ban'

const HINT_KEY = 'gogo.cms.session-hint'

/**
 * Who the mock is answering. Read from the session hint rather than kept in
 * module state, because a page reload restarts the worker while the session
 * survives — and the mock has to keep behaving per role across one: staff IP
 * in the audit log is ops_admin and above, and four-eyes refuses the account
 * that drafted a config.
 */
function currentActor(): { role: AdminRole; displayName: string } {
  try {
    const raw = window.localStorage.getItem(HINT_KEY)
    const hint = raw ? (JSON.parse(raw) as { role?: AdminRole; displayName?: string }) : null
    if (hint?.role) return { role: hint.role, displayName: hint.displayName ?? mockDisplayName }
  } catch {
    // A locked-down profile falls back to the last login seen.
  }
  return { role: mockRole, displayName: mockDisplayName }
}

/** Dev accounts. `role` is chosen by the local part of the email. */
function roleFromEmail(email: string): AdminRole {
  const local = email.split('@')[0]?.toLowerCase() ?? ''
  if (local.includes('moderator')) return 'moderator'
  if (local.includes('editor')) return 'editor'
  if (local.includes('ops')) return 'ops_admin'
  return 'super_admin'
}

export const handlers = [
  // Runs before every other handler: MSW walks this list in order, and
  // returning nothing falls through to the real handler below.
  http.all(`${BASE}/*`, ({ request, cookies }) => csrfFailure(request, cookies) ?? undefined),

  http.post(`${BASE}/cms/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string; totp?: string }
    if (!body.email || !body.password) return envelope(401, 'UNAUTHORIZED', 'bad credentials')
    // Exercise the MFA branch: any account with no code gets asked once.
    if (!body.totp) return envelope(401, 'MFA_REQUIRED', 'totp required')
    if (!/^\d{6}$/.test(body.totp)) return envelope(401, 'MFA_REQUIRED', 'totp invalid')
    const role = roleFromEmail(body.email)
    mockRole = role
    mockDisplayName = body.email.split('@')[0] ?? 'ban'
    return HttpResponse.json(
      {
        accessToken: 'mock-access-token',
        role,
        displayName: body.email.split('@')[0],
        expiresIn: 900,
      },
      { status: 201, headers: sessionCookies() },
    )
  }),

  /*
   * `POST /cms/auth/refresh`. The access cookie is short-lived, so the console
   * has to survive its expiry without throwing the operator back to login.
   * The mock rotates the same cookies the server rotates.
   */
  http.post(`${BASE}/cms/auth/refresh`, () =>
    HttpResponse.json(
      { accessToken: 'mock-access-token', role: mockRole, displayName: mockDisplayName },
      { status: 201, headers: sessionCookies() },
    ),
  ),

  http.get(`${BASE}/cms/ops/kpis`, () => HttpResponse.json(opsKpis)),

  /*
   * `POST /cms/auth/admins` — super-admin only, and the mock enforces it so the
   * UI has to survive a demotion mid-session rather than assume the route gate
   * held. Mirrors the contract's floors: 12-character password, four-value
   * role, unique email. The password is never echoed back.
   */
  http.post(`${BASE}/cms/auth/admins`, async ({ request }) => {
    if (currentActor().role !== 'super_admin') {
      return envelope(403, 'FORBIDDEN', 'super admin required')
    }
    const body = (await request.json()) as {
      email?: string
      password?: string
      displayName?: string
      role?: AdminRole
    }
    if (!body.password || body.password.length < 12) {
      return HttpResponse.json(
        {
          code: 'VALIDATION_FAILED',
          message: 'password too short',
          field_errors: [
            { field: 'password', code: 'TOO_SHORT', message: 'Mật khẩu phải từ 12 ký tự.' },
          ],
          request_id: 'mock-validation-failed',
          retryable: false,
        },
        { status: 400 },
      )
    }
    if (body.email && db.adminEmails.includes(body.email.toLowerCase())) {
      return HttpResponse.json(
        {
          code: 'CONFLICT',
          message: 'email already registered',
          field_errors: [
            { field: 'email', code: 'DUPLICATE', message: 'Email này đã có tài khoản.' },
          ],
          request_id: 'mock-conflict',
          retryable: false,
        },
        { status: 409 },
      )
    }
    if (body.email) db.adminEmails.push(body.email.toLowerCase())
    return HttpResponse.json({ created: true }, { status: 201 })
  }),

  http.get(`${BASE}/cms/places`, ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.places
    if (status) items = items.filter((place) => place.status === status)
    if (q) {
      items = items.filter(
        (place) =>
          place.name.toLowerCase().includes(q) ||
          (place.addressText ?? '').toLowerCase().includes(q),
      )
    }
    // `GET /cms/places` returns the lean list item, not the detail row.
    return HttpResponse.json({
      items: items.map((place) => ({
        id: place.id,
        name: place.name,
        status: place.status,
        areaKey: place.areaKey,
        rating: place.ratings.provider.rating ?? null,
        confidence: place.confidence,
        freshnessCheckedAt: place.freshnessCheckedAt,
        createdAt: place.createdAt,
        updatedAt: place.updatedAt,
      })),
      nextCursor: null,
    })
  }),

  // Raw SQL rows: bare array, snake_case, four columns.
  http.get(`${BASE}/cms/places/stale`, () =>
    HttpResponse.json(
      db.places
        .filter((place) => place.status === 'published')
        .map((place) => ({
          id: place.id,
          name: place.name,
          status: place.status,
          freshness_checked_at: place.freshnessCheckedAt ?? null,
        })),
    ),
  ),

  http.get(`${BASE}/cms/places/duplicates`, () => HttpResponse.json(db.duplicates)),

  http.get(`${BASE}/cms/places/:id/audit`, ({ params }) =>
    HttpResponse.json({
      items: auditEntries.filter((entry) => entry.resourceId === params.id),
      nextCursor: null,
    }),
  ),

  /*
   * `GET /cms/audit`. The mock reproduces the two behaviours the UI must
   * handle: `breakGlass=true` narrows to emergency takedowns, and `ipAddress`
   * is only present for ops_admin and above — for anyone else the field is
   * absent rather than empty.
   */
  http.get(`${BASE}/cms/audit`, ({ request }) => {
    const url = new URL(request.url)
    const breakGlass = url.searchParams.get('breakGlass') === 'true'
    const resourceType = url.searchParams.get('resourceType')
    const resourceId = url.searchParams.get('resourceId')
    const action = url.searchParams.get('action')
    const actorId = url.searchParams.get('actorId')
    const { role } = currentActor()
    const canSeeIp = role === 'ops_admin' || role === 'super_admin'

    let items = [...db.audit, ...auditEntries]
    if (breakGlass) items = items.filter((entry) => entry.breakGlass)
    if (resourceType) items = items.filter((entry) => entry.resourceType === resourceType)
    if (resourceId) items = items.filter((entry) => entry.resourceId === resourceId)
    if (action) items = items.filter((entry) => entry.action.includes(action))
    if (actorId) items = items.filter((entry) => entry.actorId === actorId)

    return HttpResponse.json({
      items: items.map(({ ipAddress, ...entry }) =>
        canSeeIp && ipAddress ? { ...entry, ipAddress } : entry,
      ),
      nextCursor: null,
    })
  }),

  http.get(`${BASE}/cms/places/:id`, ({ params }) => {
    const place = db.places.find((item) => item.id === params.id)
    if (!place) return envelope(404, 'NOT_FOUND', 'place not found')
    return HttpResponse.json(place)
  }),

  http.patch(`${BASE}/cms/places/:id`, async ({ params, request }) => {
    const place = db.places.find((item) => item.id === params.id)
    if (!place) return envelope(404, 'NOT_FOUND', 'place not found')
    Object.assign(place, await request.json())
    place.updatedAt = new Date().toISOString()
    return HttpResponse.json(place)
  }),

  http.patch(`${BASE}/cms/places/:id/status`, async ({ params, request }) => {
    const place = db.places.find((item) => item.id === params.id)
    if (!place) return envelope(404, 'NOT_FOUND', 'place not found')
    const body = (await request.json()) as { status: PlaceStatus }
    place.status = body.status
    return HttpResponse.json(place)
  }),

  http.put(`${BASE}/cms/places/:id/hours`, async ({ params, request }) => {
    const place = db.places.find((item) => item.id === params.id)
    if (!place) return envelope(404, 'NOT_FOUND', 'place not found')
    const body = (await request.json()) as {
      hours: Omit<(typeof place.hours)[number], 'source' | 'verifiedAt'>[]
    }
    // The server stamps provenance; the client never sends it.
    const verifiedAt = new Date().toISOString()
    place.hours = body.hours.map((hour) => ({ ...hour, source: 'editor', verifiedAt }))
    place.freshnessCheckedAt = verifiedAt
    return HttpResponse.json(place)
  }),

  http.post(`${BASE}/cms/places/:id/prices`, async ({ params, request }) => {
    const place = db.places.find((item) => item.id === params.id)
    if (!place) return envelope(404, 'NOT_FOUND', 'place not found')
    const body = (await request.json()) as { priceMin: number; priceMax: number; unit: string }
    place.prices = [
      ...place.prices,
      {
        id: `pr-${place.prices.length + 1}`,
        priceMin: body.priceMin,
        priceMax: body.priceMax,
        currency: 'VND',
        unit: body.unit,
        source: 'editor',
        confidence: 1,
        verifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]
    return HttpResponse.json(place, { status: 201 })
  }),

  http.post(`${BASE}/cms/places/:id/verify-freshness`, ({ params }) => {
    const place = db.places.find((item) => item.id === params.id)
    if (!place) return envelope(404, 'NOT_FOUND', 'place not found')
    place.freshnessCheckedAt = new Date().toISOString()
    return HttpResponse.json(place, { status: 201 })
  }),

  http.post(`${BASE}/cms/places/:id/merge`, async ({ params, request }) => {
    const body = (await request.json()) as { duplicateId: string }
    db.duplicates = db.duplicates.filter(
      (row) =>
        !(
          (row.place_a === params.id && row.place_b === body.duplicateId) ||
          (row.place_b === params.id && row.place_a === body.duplicateId)
        ),
    )
    return HttpResponse.json({ merged: true }, { status: 201 })
  }),

  // A bare array, and inactive keys are included unless asked otherwise.
  http.get(`${BASE}/cms/taxonomies`, ({ request }) => {
    const url = new URL(request.url)
    const kind = url.searchParams.get('kind')
    const isActive = url.searchParams.get('isActive')
    let items = db.taxonomies
    if (kind) items = items.filter((item) => item.kind === kind)
    if (isActive != null) items = items.filter((item) => item.isActive === (isActive === 'true'))
    return HttpResponse.json(items)
  }),

  http.post(`${BASE}/cms/taxonomies`, async ({ request }) => {
    const body = (await request.json()) as {
      kind: (typeof db.taxonomies)[number]['kind']
      key: string
      labels: Record<string, string>
    }
    const created = {
      id: `tx-${body.key}`,
      kind: body.kind,
      key: body.key,
      labels: body.labels,
      sortOrder: db.taxonomies.length + 1,
      isActive: true,
      usageCount: 0,
      synonyms: [],
    }
    db.taxonomies = [...db.taxonomies, created]
    return HttpResponse.json(created, { status: 201 })
  }),

  http.patch(`${BASE}/cms/taxonomies/:id`, async ({ params, request }) => {
    const taxonomy = db.taxonomies.find((item) => item.id === params.id)
    if (!taxonomy) return envelope(404, 'NOT_FOUND', 'taxonomy not found')
    Object.assign(taxonomy, await request.json())
    return HttpResponse.json(taxonomy)
  }),

  http.post(`${BASE}/cms/taxonomies/:id/synonyms`, async ({ params, request }) => {
    const taxonomy = db.taxonomies.find((item) => item.id === params.id)
    if (!taxonomy) return envelope(404, 'NOT_FOUND', 'taxonomy not found')
    const body = (await request.json()) as { term: string; locale?: string }
    taxonomy.synonyms = [
      ...taxonomy.synonyms,
      {
        id: `syn-${taxonomy.id}-${taxonomy.synonyms.length + 1}`,
        term: body.term,
        locale: body.locale ?? 'vi',
      },
    ]
    return HttpResponse.json(taxonomy, { status: 201 })
  }),

  http.get(`${BASE}/cms/collections`, ({ request }) => {
    const status = new URL(request.url).searchParams.get('status')
    const items = status ? db.collections.filter((item) => item.status === status) : db.collections
    return HttpResponse.json(items)
  }),

  http.post(`${BASE}/cms/collections`, async ({ request }) => {
    const body = (await request.json()) as { slug: string; title: string }
    const created = {
      id: `col-${body.slug}`,
      slug: body.slug,
      locale: 'vi',
      title: body.title,
      status: 'draft' as CollectionStatus,
      startsAt: null,
      endsAt: null,
    }
    db.collections = [created, ...db.collections]
    return HttpResponse.json(created, { status: 201 })
  }),

  http.patch(`${BASE}/cms/collections/:id/status`, async ({ params, request }) => {
    const collection = db.collections.find((item) => item.id === params.id)
    if (!collection) return envelope(404, 'NOT_FOUND', 'collection not found')
    const body = (await request.json()) as { status: CollectionStatus }
    collection.status = body.status
    return HttpResponse.json(collection)
  }),

  http.get(`${BASE}/cms/collections/:id/items`, ({ params }) => {
    const collection = db.collections.find((item) => item.id === params.id)
    if (!collection) return envelope(404, 'NOT_FOUND', 'collection not found')
    return HttpResponse.json({
      collectionId: collection.id,
      items: db.items[collection.id] ?? [],
    })
  }),

  // Replaces the whole list, exactly like the real endpoint — which is why the
  // read above has to exist for the write to be safe.
  http.put(`${BASE}/cms/collections/:id/items`, async ({ params, request }) => {
    const collection = db.collections.find((item) => item.id === params.id)
    if (!collection) return envelope(404, 'NOT_FOUND', 'collection not found')
    const body = (await request.json()) as { placeIds: string[] }
    db.items[collection.id] = body.placeIds.map((placeId, position) => {
      const place = db.places.find((item) => item.id === placeId)
      return {
        position,
        placeId,
        name: place?.name ?? placeId,
        addressText: place?.addressText ?? null,
        status: place?.status ?? ('draft' as PlaceStatus),
      }
    })
    return HttpResponse.json({ count: body.placeIds.length })
  }),

  http.get(`${BASE}/cms/moderation`, () => HttpResponse.json(db.moderation)),

  /*
   * `GET /cms/moderation/reviews` (GoGo-BE#219). The mock reproduces what the
   * console has to handle: server-side filters, keyset paging over
   * (createdAt, id), and a `totalCount` that describes the FILTERED set rather
   * than the page — the whole point of the endpoint.
   */
  http.get(`${BASE}/cms/moderation/reviews`, ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') ?? 'pending'
    const rating = url.searchParams.get('rating')
    const reported = url.searchParams.get('reported')
    const dateFrom = url.searchParams.get('dateFrom')
    const dateTo = url.searchParams.get('dateTo')
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')

    let items = db.reviewQueue.filter((review) => review.status === status)
    if (rating) items = items.filter((review) => review.rating === Number(rating))
    if (reported === 'true') items = items.filter((review) => review.openReportCount > 0)
    if (reported === 'false') items = items.filter((review) => review.openReportCount === 0)
    if (dateFrom) items = items.filter((review) => review.createdAt >= dateFrom)
    // Exclusive upper bound, matching the contract.
    if (dateTo) items = items.filter((review) => review.createdAt < dateTo)

    const totalCount = items.length
    const start = cursor ? items.findIndex((review) => review.id === cursor) + 1 : 0
    const page = items.slice(start, start + limit)
    const last = page[page.length - 1]
    const nextCursor = start + limit < items.length && last ? last.id : null

    return HttpResponse.json({ items: page, nextCursor, totalCount })
  }),

  http.get(`${BASE}/cms/moderation/counts`, () =>
    HttpResponse.json({
      reviews: db.reviewQueue.filter((review) => review.status === 'pending').length,
      reports: db.moderation.reports.length,
      checkins: db.moderation.checkins.length,
      communityPlaces: db.moderation.communityPlaces.length,
      total:
        db.reviewQueue.filter((review) => review.status === 'pending').length +
        db.moderation.reports.length +
        db.moderation.checkins.length +
        db.moderation.communityPlaces.length,
    }),
  ),

  // SEC-001 break-glass. The mock enforces the two rules the UI has to survive:
  // only the one accepted transition, and the per-actor rate limit.
  ...(['places', 'reviews', 'checkins'] as const).map((kind) =>
    http.post(
      `${BASE}/cms/emergency/${kind}/:id/${kind === 'places' ? 'suspend' : 'hide'}`,
      async ({ params, request }) => {
        const body = (await request.json()) as { reason?: string }
        if (!body.reason || body.reason.trim().length < 10) {
          return envelope(400, 'VALIDATION_FAILED', 'reason must be at least 10 characters')
        }
        db.takedowns += 1
        if (db.takedowns > 5) {
          return envelope(429, 'RATE_LIMITED', 'emergency takedown burst limit reached')
        }
        if (kind === 'places') {
          const place = db.places.find((item) => item.id === params.id)
          if (!place) return envelope(404, 'PLACE_NOT_FOUND', 'place not found')
          if (place.status !== 'published') {
            return envelope(
              409,
              'NOT_TAKEDOWNABLE',
              'emergency takedown applies to published places only',
            )
          }
          place.status = 'suspended'
          return HttpResponse.json({ id: place.id, status: 'suspended' }, { status: 201 })
        }
        if (kind === 'reviews') {
          db.moderation.reviews = db.moderation.reviews.filter((item) => item.id !== params.id)
          return HttpResponse.json({ id: params.id, status: 'hidden' }, { status: 201 })
        }
        db.moderation.checkins = db.moderation.checkins.filter((item) => item.id !== params.id)
        return HttpResponse.json({ id: params.id, moderation: 'hidden' }, { status: 201 })
      },
    ),
  ),

  http.post(`${BASE}/cms/moderation/:kind/:id`, async ({ params, request }) => {
    const body = (await request.json()) as { decision: string; reason: string }
    if (!body.reason || body.reason.trim().length < 3) {
      return envelope(400, 'REASON_REQUIRED', 'reason is mandatory')
    }
    const key =
      params.kind === 'reviews' ? 'reviews' : params.kind === 'reports' ? 'reports' : 'checkins'
    db.moderation[key] = db.moderation[key].filter((item) => item.id !== params.id) as never
    if (key === 'reviews') {
      const review = db.reviewQueue.find((item) => item.id === params.id)
      if (review) {
        review.status = body.decision === 'published' ? 'published' : 'rejected'
        review.moderatedByAdminId = '00000000-0000-4000-8000-0000000000aa'
        review.moderationReason = body.reason
        review.updatedAt = new Date().toISOString()
      }
    }
    const actor = currentActor()
    db.audit.unshift({
      id: `audit-${key}-${String(params.id)}`,
      action: `${key.replace(/s$/, '')}.${body.decision}`,
      actorType: 'admin',
      actorId: '00000000-0000-4000-8000-0000000000aa',
      actorRole: actor.role,
      resourceType: key.replace(/s$/, ''),
      resourceId: String(params.id),
      occurredAt: new Date().toISOString(),
      diff: { after: { status: body.decision } },
      reason: body.reason,
      breakGlass: false,
    })
    return HttpResponse.json({ decided: true }, { status: 201 })
  }),

  http.get(`${BASE}/cms/place-submissions`, ({ request }) => {
    const status = new URL(request.url).searchParams.get('status') ?? 'pending'
    const items = status === 'pending' ? db.submissions : db.decidedSubmissions
    return HttpResponse.json({ items, nextCursor: null })
  }),

  http.post(`${BASE}/cms/place-submissions/:id/decide`, async ({ params, request }) => {
    const body = (await request.json()) as { decision: string; reason: string }
    if (!body.reason || body.reason.trim().length < 3) {
      return envelope(400, 'REASON_REQUIRED', 'reason is mandatory')
    }
    db.moderation.communityPlaces = db.moderation.communityPlaces.filter(
      (item) => item.id !== params.id,
    )
    db.submissions = db.submissions.filter((item: { id: string }) => item.id !== params.id)
    return HttpResponse.json({ decided: true }, { status: 201 })
  }),

  http.get(`${BASE}/cms/ranking-configs`, ({ request }) => {
    const url = new URL(request.url)
    const key = url.searchParams.get('key')
    const status = url.searchParams.get('status')
    let items = db.configs
    if (key) items = items.filter((config) => config.key === key)
    if (status) items = items.filter((config) => config.status === status)
    return HttpResponse.json(items)
  }),

  http.get(`${BASE}/cms/ranking-configs/:id/evaluate`, ({ params }) => {
    const config = db.configs.find((item) => item.id === params.id)
    if (!config) return envelope(404, 'NOT_FOUND', 'config not found')
    return HttpResponse.json({ ...rankingEvaluation, configVersion: config.version })
  }),

  http.get(`${BASE}/cms/experiments`, () => HttpResponse.json(db.experiments)),

  http.put(`${BASE}/cms/experiments/:key`, async ({ params, request }) => {
    const body = (await request.json()) as {
      enabled: boolean
      variants: Record<string, number>
      description?: string
    }
    const total = Object.values(body.variants).reduce((sum, share) => sum + share, 0)
    // The real service refuses over-allocation rather than dropping a variant.
    if (total > 1)
      return envelope(400, 'VARIANT_SHARES_EXCEED_ONE', 'Variant shares must sum to at most 1')

    const key = String(params.key)
    const existing = db.experiments.find((item) => item.key === key)
    const saved = {
      key,
      description: body.description ?? existing?.description ?? null,
      enabled: body.enabled,
      variants: body.variants,
      controlShare: Number((1 - total).toFixed(4)),
      updatedAt: new Date().toISOString(),
    }
    db.experiments = existing
      ? db.experiments.map((item) => (item.key === key ? saved : item))
      : [...db.experiments, saved]
    return HttpResponse.json(saved)
  }),

  http.get(`${BASE}/cms/search-analytics`, ({ request }) => {
    const days = Number.parseInt(new URL(request.url).searchParams.get('days') ?? '7', 10)
    return HttpResponse.json({ ...searchAnalytics, days })
  }),

  http.post(`${BASE}/cms/ranking-configs`, async ({ request }) => {
    const body = (await request.json()) as { key: string; weights: Record<string, number> }
    const created = {
      id: `rc-${db.configs.length + 1}`,
      key: body.key as (typeof db.configs)[number]['key'],
      version: Math.max(...db.configs.map((config) => config.version)) + 1,
      status: 'draft' as const,
      weights: body.weights,
      bounds: db.configs[0]?.bounds ?? {},
      createdBy: { id: 'ad-me', displayName: currentActor().displayName },
      createdAt: new Date().toISOString(),
      approvedBy: null,
      activatedAt: null,
    }
    db.configs = [created, ...db.configs]
    return HttpResponse.json(created, { status: 201 })
  }),

  http.post(`${BASE}/cms/ranking-configs/:id/approve`, ({ params }) => {
    const config = db.configs.find((item) => item.id === params.id)
    if (!config) return envelope(404, 'NOT_FOUND', 'config not found')
    // Four-eyes is a server rule; the mock enforces it so the UI can be tested.
    if (config.createdBy.displayName === currentActor().displayName)
      return envelope(403, 'SELF_APPROVAL', 'creator cannot self-approve')
    config.status = 'approved'
    config.approvedBy = { id: 'ad-me', displayName: mockDisplayName }
    return HttpResponse.json(config, { status: 201 })
  }),

  http.post(`${BASE}/cms/ranking-configs/:id/activate`, ({ params }) => {
    const config = db.configs.find((item) => item.id === params.id)
    if (!config) return envelope(404, 'NOT_FOUND', 'config not found')
    if (config.status !== 'approved') return envelope(409, 'CONFLICT', 'config is not approved')
    for (const other of db.configs) if (other.status === 'active') other.status = 'rolled_back'
    config.status = 'active'
    config.activatedAt = new Date().toISOString()
    return HttpResponse.json(config, { status: 201 })
  }),

  http.post(`${BASE}/cms/ranking-configs/:key/rollback`, () => {
    for (const config of db.configs) if (config.status === 'active') config.status = 'rolled_back'
    return HttpResponse.json({ rolledBack: true }, { status: 201 })
  }),

  http.get(`${BASE}/cms/feature-flags`, () => HttpResponse.json(db.flags)),

  http.put(`${BASE}/cms/feature-flags/:key`, async ({ params, request }) => {
    const flag = db.flags.find((item) => item.key === params.key)
    if (!flag) return envelope(404, 'NOT_FOUND', 'flag not found')
    const body = (await request.json()) as { enabled: boolean }
    flag.enabled = body.enabled
    flag.updatedBy = { id: 'ad-me', displayName: currentActor().displayName }
    flag.updatedAt = new Date().toISOString()
    return HttpResponse.json(flag)
  }),

  http.get(`${BASE}/cms/place-imports`, ({ request }) => {
    const url = new URL(request.url)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const page = db.jobs.slice(offset, offset + limit)
    return HttpResponse.json({
      items: page,
      nextOffset: offset + limit < db.jobs.length ? offset + limit : null,
    })
  }),

  http.post(`${BASE}/cms/place-imports`, async ({ request }) => {
    const form = await request.formData()
    const file = form.get('file')
    const job = {
      ...db.jobs[0]!,
      id: crypto.randomUUID(),
      status: 'uploaded' as const,
      mode: (form.get('mode') as (typeof db.jobs)[number]['mode']) ?? 'dry_run',
      sourceType: 'csv' as const,
      sourceFileName: file instanceof File ? file.name : 'upload.csv',
      totals: { rows: 0, processed: 0, success: 0, warnings: 0, failed: 0 },
      createdAt: new Date().toISOString(),
      reused: false,
      rowsByStatus: {},
      unmappedHeaders: [],
    }
    db.jobs = [job, ...db.jobs]
    db.rows[job.id] = []
    return HttpResponse.json(job, { status: 201 })
  }),

  http.post(`${BASE}/cms/place-imports/google-sheet`, async ({ request }) => {
    const body = (await request.json()) as { spreadsheetUrl: string; mode?: string }
    if (!body.spreadsheetUrl.includes('docs.google.com')) {
      return envelope(400, 'SHEET_URL_INVALID', 'only docs.google.com links are accepted')
    }
    const job = {
      ...db.jobs[0]!,
      id: crypto.randomUUID(),
      status: 'uploaded' as const,
      mode: (body.mode as (typeof db.jobs)[number]['mode']) ?? 'dry_run',
      sourceType: 'google_sheet' as const,
      sourceFileName: 'google-sheet',
      totals: { rows: 0, processed: 0, success: 0, warnings: 0, failed: 0 },
      createdAt: new Date().toISOString(),
      reused: false,
      rowsByStatus: {},
      unmappedHeaders: [],
    }
    db.jobs = [job, ...db.jobs]
    db.rows[job.id] = []
    return HttpResponse.json(job, { status: 201 })
  }),

  http.get(`${BASE}/cms/place-imports/:jobId/rows`, ({ params, request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const all = db.rows[String(params.jobId)] ?? []
    const filtered = status ? all.filter((row) => row.status === status) : all
    return HttpResponse.json({
      items: filtered.slice(offset, offset + limit),
      nextOffset: offset + limit < filtered.length ? offset + limit : null,
    })
  }),

  http.get(`${BASE}/cms/place-imports/:jobId/error-report`, () =>
    // Formula injection is neutralised server-side; the mock keeps the shape.
    HttpResponse.text("row,code,message\n12,DISTRICT_MISMATCH,'=khac quan\n", {
      headers: { 'Content-Type': 'text/csv' },
    }),
  ),

  http.post(`${BASE}/cms/place-imports/:jobId/start`, ({ params }) => {
    const job = db.jobs.find((item) => item.id === params.jobId)
    if (!job) return envelope(404, 'NOT_FOUND', 'job not found')
    if (job.mode === 'dry_run') return envelope(409, 'CONFLICT', 'dry_run jobs cannot be started')
    job.status = 'processing'
    job.startedAt = new Date().toISOString()
    return HttpResponse.json(job, { status: 201 })
  }),

  http.post(`${BASE}/cms/place-imports/:jobId/cancel`, ({ params }) => {
    const job = db.jobs.find((item) => item.id === params.jobId)
    if (!job) return envelope(404, 'NOT_FOUND', 'job not found')
    job.status = 'cancelled'
    job.cancelledAt = new Date().toISOString()
    return HttpResponse.json(job, { status: 201 })
  }),

  http.post(`${BASE}/cms/place-imports/:jobId/retry`, ({ params }) => {
    const job = db.jobs.find((item) => item.id === params.jobId)
    if (!job) return envelope(404, 'NOT_FOUND', 'job not found')
    job.status = 'processing'
    job.retriedRows = job.totals.failed
    return HttpResponse.json(job, { status: 201 })
  }),

  http.post(
    `${BASE}/cms/place-imports/:jobId/rows/:rowId/confirm-candidate`,
    async ({ params, request }) => {
      const rows = db.rows[String(params.jobId)] ?? []
      const row = rows.find((item) => item.id === params.rowId)
      if (!row) return envelope(404, 'NOT_FOUND', 'row not found')
      const body = (await request.json()) as { googlePlaceId: string }
      if (!row.candidates.some((candidate) => candidate.googlePlaceId === body.googlePlaceId)) {
        return envelope(400, 'CANDIDATE_NOT_LISTED', 'candidate was not surfaced for this row')
      }
      row.status = 'ready'
      row.resolvedGooglePlaceId = body.googlePlaceId
      row.candidates = []
      return HttpResponse.json(row, { status: 201 })
    },
  ),

  http.post(`${BASE}/cms/place-imports/:jobId/rows/:rowId/merge`, async ({ params, request }) => {
    const rows = db.rows[String(params.jobId)] ?? []
    const row = rows.find((item) => item.id === params.rowId)
    if (!row) return envelope(404, 'NOT_FOUND', 'row not found')
    const body = (await request.json()) as { placeId: string }
    row.status = 'imported'
    row.matchedPlaceId = body.placeId
    return HttpResponse.json(row, { status: 201 })
  }),

  http.post(`${BASE}/cms/place-imports/:jobId/rows/:rowId/skip`, ({ params }) => {
    const rows = db.rows[String(params.jobId)] ?? []
    const row = rows.find((item) => item.id === params.rowId)
    if (!row) return envelope(404, 'NOT_FOUND', 'row not found')
    row.status = 'failed'
    return HttpResponse.json(row, { status: 201 })
  }),

  http.post(`${BASE}/cms/place-imports/:jobId/publish`, ({ params }) => {
    const job = db.jobs.find((item) => item.id === params.jobId)
    if (!job) return envelope(404, 'NOT_FOUND', 'job not found')
    const rows = db.rows[String(params.jobId)] ?? []
    const ready = rows.filter((row) => row.status === 'ready')
    for (const row of ready) row.status = 'imported'
    job.rowsByStatus = { ...job.rowsByStatus, ready: 0, imported: ready.length }
    job.status = 'completed'
    return HttpResponse.json({ jobId: job.id, created: ready.length, failed: [] }, { status: 201 })
  }),

  http.get(`${BASE}/cms/place-imports/:jobId`, ({ params }) => {
    const job = db.jobs.find((item) => item.id === params.jobId)
    if (!job) return envelope(404, 'NOT_FOUND', 'job not found')
    return HttpResponse.json(job)
  }),
]
