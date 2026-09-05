import { http, HttpResponse } from 'msw'
import type { AdminRole, CollectionStatus, PlaceStatus } from '@/shared/api/contracts'
import { ALLOWED_ACTIONS, ALLOWED_TRIGGERS } from '@/features/safety/conditions'
import type { ImportRow } from '@/shared/api/contracts-import'
import {
  costOverview,
  costServiceOperations,
  costServices,
  costTestRunDetails,
  costTestRuns,
  auditEntries,
  collectionItems,
  collections,
  decidedSubmissions,
  duplicateRows,
  featureFlags,
  importJobs,
  importRows,
  opsKpis,
  experiments,
  placeSubmissions,
  places,
  rankingConfigs,
  rankingEvaluation,
  searchAnalytics,
  taxonomies,
  moderationReviewQueue,
  cmsAdmins,
  featureFlagCatalog,
  moderationReportQueue,
  moderationCheckinQueue,
  communityPlaceQueue,
  cmsRecommendations,
  cmsSafetyRules,
  cmsBanners,
  cmsCampaigns,
  opsHealth,
  opsQueues,
  opsCosts,
  cmsManualCostEligibleServices,
  cmsManualCostItems,
  opsProviders,
  opsSummary,
  cmsAppUsers,
  cmsRooms,
  cmsPlans,
  cmsRoomGuests,
  privacyRequests,
  cmsPlanTemplates,
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
  reports: moderationReportQueue.map((row) => ({ ...row })),
  checkins: moderationCheckinQueue.map((row) => ({ ...row })),
  communityPlaces: communityPlaceQueue.map((row) => ({ ...row })),
  reviewQueue: JSON.parse(JSON.stringify(moderationReviewQueue)) as typeof moderationReviewQueue,
  submissions: placeSubmissions.map((item) => ({ ...item })),
  experiments: experiments.map((item) => ({ ...item })),
  items: JSON.parse(JSON.stringify(collectionItems)) as typeof collectionItems,
  decidedSubmissions: decidedSubmissions.map((item) => ({ ...item })),
  /** Upload keys issued this session; a banner may only reference one of them. */
  uploads: [] as string[],
  /** Counts break-glass calls so the burst limit is reachable in dev. */
  takedowns: 0,
  /** Audit entries written during this session, newest first. */
  audit: [] as (typeof auditEntries)[number][],
  /** Emails already taken, so the duplicate branch of admin creation is reachable. */
  adminEmails: ['boss@gogo.vn', 'ops@gogo.vn', 'editor@gogo.vn', 'moderator@gogo.vn'],
  admins: cmsAdmins.map((admin) => ({ ...admin })),
  recommendations: JSON.parse(JSON.stringify(cmsRecommendations)) as typeof cmsRecommendations,
  planTemplates: JSON.parse(JSON.stringify(cmsPlanTemplates)) as typeof cmsPlanTemplates,
  safetyRules: JSON.parse(JSON.stringify(cmsSafetyRules)) as typeof cmsSafetyRules,
  banners: JSON.parse(JSON.stringify(cmsBanners)) as typeof cmsBanners,
  appUsers: JSON.parse(JSON.stringify(cmsAppUsers)) as typeof cmsAppUsers,
  roomGuests: JSON.parse(JSON.stringify(cmsRoomGuests)) as typeof cmsRoomGuests,
  privacy: JSON.parse(JSON.stringify(privacyRequests)) as typeof privacyRequests,
  campaigns: JSON.parse(JSON.stringify(cmsCampaigns)) as typeof cmsCampaigns,
  manualCosts: JSON.parse(JSON.stringify(cmsManualCostItems)) as typeof cmsManualCostItems,
  /** Idempotency-Key → the item it created, so a replay returns that one. */
  manualCostKeys: new Map<string, (typeof cmsManualCostItems)[number]>(),
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

/** A refused write: one field error, the way GoGo-BE's `AppError.badRequest` shapes it. */
function fieldEnvelope(code: string, field: string, fieldCode: string, message: string) {
  return HttpResponse.json(
    {
      code,
      message,
      field_errors: [{ field, code: fieldCode, message }],
      request_id: `mock-${fieldCode}`,
      retryable: false,
    },
    { status: 400 },
  )
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

/** Keyset page over `(createdAt, id)`, mirroring the per-type queue contracts. */
function pageOf<T extends { id: string }>(items: T[], limit: number, cursor: string | null) {
  const start = cursor ? items.findIndex((item) => item.id === cursor) + 1 : 0
  const page = items.slice(start, start + limit)
  const last = page[page.length - 1]
  return {
    items: page,
    nextCursor: start + limit < items.length && last ? last.id : null,
    totalCount: items.length,
  }
}

/**
 * `ops_admin` in both directions, so a moderator sees neither the list nor a
 * rule. Reads do not climb into this resource (BE-IMP-008), and the mock says
 * so rather than letting the console look more permissive than the server.
 */
function requireOpsAdmin(message = 'safety rules are ops_admin only') {
  const { role } = currentActor()
  if (role === 'ops_admin' || role === 'super_admin') return null
  return envelope(403, 'FORBIDDEN', message)
}

/** Editing is only meaningful while nothing has been sent. */
const EDITABLE_CAMPAIGN_STATUSES: string[] = ['draft', 'cancelled', 'failed']

/**
 * `expired` is computed from the end time on every read, never stored — a
 * stored expiry is wrong for as long as it takes something to notice. Only a
 * published banner can expire; a draft with a past end time is still a draft.
 */
function effectiveBannerStatus(row: (typeof cmsBanners)[number]) {
  if (row.lifecycleStatus !== 'published') return row.lifecycleStatus
  if (row.endsAt && new Date(row.endsAt).getTime() <= Date.now()) return 'expired' as const
  return row.lifecycleStatus
}

/** A 1×1 transparent PNG, base64. */
const TRANSPARENT_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

/**
 * Suspend/ban/reactivate share one shape: reason floor, USER_DELETED as the
 * terminal-state refusal, sessions conceptually revoked with the status.
 */
async function userStatusAction(
  id: string,
  request: Request,
  next: 'suspended' | 'banned' | 'active',
) {
  const denied = requireOpsAdmin('the user base is ops_admin and above')
  if (denied) return denied
  const row = db.appUsers.find((item) => item.id === id)
  if (!row) return envelope(404, 'NOT_FOUND', 'user not found')
  const body = (await request.json()) as { reason?: string }
  if (!body.reason || body.reason.trim().length < 3) {
    return envelope(400, 'BAD_REQUEST', 'reason required')
  }
  if (row.status === 'deleted') {
    return envelope(409, 'USER_DELETED', 'a deleted account cannot change status')
  }
  row.status = next
  row.statusReason = next === 'active' ? null : body.reason
  row.statusChangedAt = new Date().toISOString()
  return HttpResponse.json({ id: row.id, status: row.status }, { status: 201 })
}

/**
 * What GoGo-BE refuses on a manual cost write, as field errors: a service the
 * registry does not list under MANUAL_COST, and an end before the start.
 */
function refuseManualCost(body: Record<string, unknown>) {
  const service = cmsManualCostEligibleServices.find(
    (candidate) =>
      candidate.serviceId === body.serviceId && candidate.providerId === body.providerId,
  )
  if (!service) {
    return fieldEnvelope(
      'COST_MANUAL_ITEM_INVALID',
      'serviceId',
      'manual_cost_not_supported',
      `${String(body.serviceId)} does not declare MANUAL_COST; a manual item cannot name it`,
    )
  }
  const from = String(body.effectiveFrom ?? '')
  const to = body.effectiveTo
  if (typeof to === 'string' && to < from) {
    return fieldEnvelope(
      'COST_MANUAL_ITEM_INVALID',
      'effectiveTo',
      'invalid_range',
      'effectiveTo must not be before effectiveFrom',
    )
  }
  return null
}

function recordManualCostAudit(action: string, resourceId: string, diff: unknown): void {
  const { role } = currentActor()
  db.audit.unshift({
    id: `audit-mc-${db.audit.length + 1}`,
    action,
    actorType: 'admin',
    actorId: 'adm-mock',
    actorRole: role,
    resourceType: 'manual_cost_item',
    resourceId,
    occurredAt: new Date().toISOString(),
    diff,
    reason: null,
    breakGlass: false,
    requestId: `mock-${action}`,
    ipAddress: '10.0.0.1',
    authorizationPath: null,
  })
}

export const handlers = [
  // Runs before every other handler: MSW walks this list in order, and
  // returning nothing falls through to the real handler below.
  http.all(`${BASE}/*`, ({ request, cookies }) => csrfFailure(request, cookies) ?? undefined),

  // CMS-031: the reachability probe. A 200 here means "the network is up".
  http.get(`${BASE}/health`, () => HttpResponse.json({ status: 'ok' })),

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
        // The forced-change branch (#248): a local part containing "temp"
        // simulates an account signing in with a temporary password.
        mustChangePassword: (body.email.split('@')[0] ?? '').includes('temp'),
      },
      { status: 201, headers: sessionCookies() },
    )
  }),

  /*
   * Staff lifecycle (GoGo-BE#248). The mock enforces exactly the refusals the
   * server declares, so the console's error copy is reachable in dev.
   */
  http.post(`${BASE}/cms/auth/change-password`, async ({ request }) => {
    const body = (await request.json()) as { currentPassword?: string; newPassword?: string }
    if (!body.currentPassword) return envelope(401, 'INVALID_CREDENTIALS', 'current password wrong')
    if (body.newPassword === body.currentPassword) {
      return envelope(400, 'PASSWORD_UNCHANGED', 'the new password must differ')
    }
    if ((body.newPassword ?? '').length < 12) {
      return envelope(400, 'BAD_REQUEST', 'newPassword under 12 chars')
    }
    return HttpResponse.json({ changed: true }, { status: 201 })
  }),

  http.patch(`${BASE}/cms/auth/admins/:id`, async ({ params, request }) => {
    const row = db.admins.find((admin) => admin.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'admin not found')
    const body = (await request.json()) as { role?: string; displayName?: string; reason?: string }
    if (!body.reason || body.reason.trim().length < 3) {
      return envelope(400, 'BAD_REQUEST', 'reason required')
    }
    const { displayName } = currentActor()
    if (body.role && row.displayName === displayName) {
      return envelope(403, 'SELF_ROLE_CHANGE', 'another super_admin must change your role')
    }
    if (
      body.role &&
      body.role !== 'super_admin' &&
      row.role === 'super_admin' &&
      db.admins.filter((admin) => admin.role === 'super_admin' && admin.status === 'active')
        .length <= 1
    ) {
      return envelope(409, 'LAST_SUPER_ADMIN', 'the console would have no administrator')
    }
    if (body.role) row.role = body.role as typeof row.role
    if (body.displayName) row.displayName = body.displayName
    return HttpResponse.json(row)
  }),

  http.post(`${BASE}/cms/auth/admins/:id/suspend`, async ({ params, request }) => {
    const row = db.admins.find((admin) => admin.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'admin not found')
    const body = (await request.json()) as { reason?: string }
    if (!body.reason || body.reason.trim().length < 3) {
      return envelope(400, 'BAD_REQUEST', 'reason required')
    }
    const { displayName } = currentActor()
    if (row.displayName === displayName) {
      return envelope(403, 'SELF_SUSPEND', 'you cannot suspend your own account')
    }
    if (
      row.role === 'super_admin' &&
      db.admins.filter((admin) => admin.role === 'super_admin' && admin.status === 'active')
        .length <= 1
    ) {
      return envelope(409, 'LAST_SUPER_ADMIN', 'the only active super_admin cannot be suspended')
    }
    row.status = 'suspended'
    return HttpResponse.json(row, { status: 201 })
  }),

  http.post(`${BASE}/cms/auth/admins/:id/reactivate`, async ({ params, request }) => {
    const row = db.admins.find((admin) => admin.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'admin not found')
    const body = (await request.json()) as { reason?: string }
    if (!body.reason || body.reason.trim().length < 3) {
      return envelope(400, 'BAD_REQUEST', 'reason required')
    }
    row.status = 'active'
    return HttpResponse.json(row, { status: 201 })
  }),

  http.post(`${BASE}/cms/auth/admins/:id/reset-password`, async ({ params, request }) => {
    const row = db.admins.find((admin) => admin.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'admin not found')
    const body = (await request.json()) as { reason?: string }
    if (!body.reason || body.reason.trim().length < 3) {
      return envelope(400, 'BAD_REQUEST', 'reason required')
    }
    row.mustChangePassword = true
    // Shown exactly once, exactly like the server: nothing stores it.
    return HttpResponse.json(
      {
        temporaryPassword: `tmp-${row.id.slice(-4)}-${Date.now().toString(36)}`,
        mustChangePassword: true,
      },
      { status: 201 },
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
  /*
   * `GET /cms/auth/admins` (GoGo-BE#220). Super-admin only, like the write —
   * the mock enforces it so the console has to survive a demotion rather than
   * assume the route gate held. Keyset-paged, and `totalCount` describes the
   * FILTERED set, not the page.
   */
  http.get(`${BASE}/cms/auth/admins`, ({ request }) => {
    if (currentActor().role !== 'super_admin') {
      return envelope(403, 'FORBIDDEN', 'super admin required')
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const role = url.searchParams.get('role')
    const status = url.searchParams.get('status')
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')

    let items = db.admins
    if (q) {
      items = items.filter(
        (admin) =>
          admin.email.toLowerCase().includes(q) || admin.displayName.toLowerCase().includes(q),
      )
    }
    if (role) items = items.filter((admin) => admin.role === role)
    if (status) items = items.filter((admin) => admin.status === status)

    const totalCount = items.length
    const start = cursor ? items.findIndex((admin) => admin.id === cursor) + 1 : 0
    const page = items.slice(start, start + limit)
    const last = page[page.length - 1]
    const nextCursor = start + limit < items.length && last ? last.id : null

    return HttpResponse.json({ items: page, nextCursor, totalCount })
  }),

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
    if (body.email) {
      db.adminEmails.push(body.email.toLowerCase())
      db.admins.unshift({
        id: `admin-${db.admins.length + 1}`,
        email: body.email,
        displayName: body.displayName ?? body.email,
        role: body.role ?? 'editor',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
        // A fresh account has no second factor and owes nothing.
        mfaEnrolled: false,
        mustChangePassword: false,
      })
    }
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

  /*
   * The per-type moderation queues (GoGo-BE#219), replacing the deprecated
   * unified read. Each filters and keyset-pages server-side and reports a
   * `totalCount` for the FILTERED set, not for the page.
   */
  http.get(`${BASE}/cms/moderation/reports`, ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') ?? 'open'
    const targetType = url.searchParams.get('targetType')
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')

    let items = db.reports.filter((report) => report.status === status)
    if (targetType) items = items.filter((report) => report.targetType === targetType)
    return HttpResponse.json(pageOf(items, limit, cursor))
  }),

  http.get(`${BASE}/cms/moderation/checkins`, ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') ?? 'pending'
    const rating = url.searchParams.get('rating')
    const hasBill = url.searchParams.get('hasBill')
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')

    let items = db.checkins.filter((checkin) => checkin.moderation === status)
    if (rating) items = items.filter((checkin) => checkin.rating === Number(rating))
    if (hasBill === 'true') items = items.filter((checkin) => checkin.hasBill)
    if (hasBill === 'false') items = items.filter((checkin) => !checkin.hasBill)
    return HttpResponse.json(pageOf(items, limit, cursor))
  }),

  http.get(`${BASE}/cms/moderation/community-places`, ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const areaKey = url.searchParams.get('areaKey')
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')

    let items = db.communityPlaces
    if (q) items = items.filter((place) => place.name.toLowerCase().includes(q))
    if (areaKey) items = items.filter((place) => place.areaKey === areaKey)
    return HttpResponse.json(pageOf(items, limit, cursor))
  }),

  http.get(`${BASE}/cms/moderation/reviews/:id`, ({ params }) => {
    // Unfiltered on purpose (BE-CMS-G6): a decided review still opens.
    const row = db.reviewQueue.find((review) => review.id === params.id)
    if (!row) return envelope(404, 'REVIEW_NOT_FOUND', 'review not found')
    return HttpResponse.json(row)
  }),

  http.get(`${BASE}/cms/moderation/counts`, () =>
    HttpResponse.json({
      reviews: db.reviewQueue.filter((review) => review.status === 'pending').length,
      reports: db.reports.filter((report) => report.status === 'open').length,
      checkins: db.checkins.filter((checkin) => checkin.moderation === 'pending').length,
      communityPlaces: db.communityPlaces.length,
      total:
        db.reviewQueue.filter((review) => review.status === 'pending').length +
        db.reports.filter((report) => report.status === 'open').length +
        db.checkins.filter((checkin) => checkin.moderation === 'pending').length +
        db.communityPlaces.length,
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
          db.reviewQueue = db.reviewQueue.filter((item) => item.id !== params.id)
          return HttpResponse.json({ id: params.id, status: 'hidden' }, { status: 201 })
        }
        db.checkins = db.checkins.filter((item) => item.id !== params.id)
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
    if (key === 'reports') {
      const report = db.reports.find((item) => item.id === params.id)
      if (report) {
        report.status = body.decision === 'actioned' ? 'actioned' : 'dismissed'
        report.decisionReason = body.reason
        report.decidedAt = new Date().toISOString()
      }
    }
    if (key === 'checkins') {
      const checkin = db.checkins.find((item) => item.id === params.id)
      if (checkin) {
        checkin.moderation = body.decision === 'approved' ? 'approved' : 'rejected'
      }
    }
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
    db.communityPlaces = db.communityPlaces.filter((item) => item.id !== params.id)
    db.submissions = db.submissions.filter((item: { id: string }) => item.id !== params.id)
    return HttpResponse.json({ decided: true }, { status: 201 })
  }),

  /*
   * Recommendations (GoGo-BE#222) — a targeted collection. The mock enforces
   * what the contract says the server enforces, so the console cannot pass
   * here and fail in production: a duplicate slug is 409, publishing with no
   * places is 400, and `archived` has no way out.
   */
  /*
   * Plan templates (GoGo-BE#223). The mock enforces the contract's refusals so
   * the console cannot pass here and fail in production: duplicate key is 409,
   * publishing with no stops is 400, `archived` is terminal, and an unknown
   * category taxonomy is rejected.
   */
  http.get(`${BASE}/cms/plan-templates`, ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const audience = url.searchParams.get('audience')
    const q = url.searchParams.get('q')?.toLowerCase()
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')

    let items = db.planTemplates
    if (status) items = items.filter((row) => row.status === status)
    if (audience) items = items.filter((row) => row.audience === audience)
    if (q) {
      items = items.filter(
        (row) =>
          row.internalName.toLowerCase().includes(q) ||
          row.title.toLowerCase().includes(q) ||
          row.slug.toLowerCase().includes(q),
      )
    }
    const page = pageOf(items, limit, cursor)
    return HttpResponse.json({
      ...page,
      items: page.items.map(({ stops, ...row }) => ({ ...row, stopCount: stops.length })),
    })
  }),

  http.post(`${BASE}/cms/plan-templates`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const slug = String(body.slug ?? '')
    if (db.planTemplates.some((row) => row.slug === slug)) {
      return envelope(409, 'SLUG_TAKEN', 'template key already used')
    }
    const created = {
      id: `tpl-${db.planTemplates.length + 100}`,
      slug,
      locale: String(body.locale ?? 'vi'),
      internalName: String(body.internalName ?? ''),
      title: String(body.title ?? ''),
      description: (body.description as string) ?? null,
      audience: (body.audience as 'couple') ?? null,
      areaKey: (body.areaKey as string) ?? null,
      budget: null,
      expectedDurationMinutes: null,
      status: 'draft' as const,
      stopCount: 0,
      taxonomies: [],
      createdByAdminId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stops: [],
    }
    db.planTemplates.unshift(created)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.get(`${BASE}/cms/plan-templates/:id`, ({ params }) => {
    const row = db.planTemplates.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'template not found')
    return HttpResponse.json(row)
  }),

  http.patch(`${BASE}/cms/plan-templates/:id`, async ({ params, request }) => {
    const row = db.planTemplates.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'template not found')
    const body = (await request.json()) as Record<string, unknown>
    for (const key of ['internalName', 'title', 'description', 'areaKey', 'audience'] as const) {
      if (body[key] !== undefined) (row as Record<string, unknown>)[key] = body[key]
    }
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json(row)
  }),

  http.patch(`${BASE}/cms/plan-templates/:id/status`, async ({ params, request }) => {
    const row = db.planTemplates.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'template not found')
    const body = (await request.json()) as { status: string }
    if (row.status === 'archived') {
      return envelope(409, 'INVALID_STATUS_TRANSITION', 'archived is terminal')
    }
    if (body.status === 'published' && row.stops.length === 0) {
      return envelope(400, 'EMPTY_TEMPLATE', 'publishing needs at least one stop')
    }
    row.status = body.status as typeof row.status
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json({ id: row.id, status: row.status })
  }),

  http.put(`${BASE}/cms/plan-templates/:id/stops`, async ({ params, request }) => {
    const row = db.planTemplates.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'template not found')
    const body = (await request.json()) as {
      stops: {
        categoryTaxonomyId: string
        expectedDurationMinutes: number
        preferredPlaceId?: string
        isOptional?: boolean
        budget?: (typeof row.stops)[number]['budget']
        note?: string
      }[]
    }
    const stops = body.stops ?? []
    if (stops.length > 20) return envelope(400, 'TOO_MANY_STOPS', 'at most 20 stops')

    const mapped = stops.map((stop, position) => {
      const taxonomy = db.taxonomies.find((item) => item.id === stop.categoryTaxonomyId)
      if (!taxonomy) return null
      if (taxonomy.kind !== 'category') return 'kind'
      const place = stop.preferredPlaceId
        ? db.places.find((item) => item.id === stop.preferredPlaceId)
        : null
      if (stop.preferredPlaceId && !place) return null
      return {
        id: `stop-${row.id}-${position}`,
        position,
        categoryTaxonomyId: taxonomy.id,
        categoryKey: taxonomy.key,
        preferredPlaceId: place?.id ?? null,
        preferredPlaceName: place?.name ?? null,
        isOptional: stop.isOptional ?? false,
        expectedDurationMinutes: stop.expectedDurationMinutes,
        budget: stop.budget ?? null,
        note: stop.note ?? null,
      }
    })
    if (mapped.some((stop) => stop === 'kind')) {
      return envelope(400, 'TAXONOMY_KIND_INVALID', 'stop category must be a category taxonomy')
    }
    if (mapped.some((stop) => stop === null)) {
      return envelope(400, 'PLACE_NOT_FOUND', 'unknown place or taxonomy')
    }
    row.stops = mapped as typeof row.stops
    row.stopCount = row.stops.length
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json(row)
  }),

  /*
   * Trust & Safety rules (GoGo-BE#225).
   *
   * `ops_admin` in both directions — reads do not climb here, so a moderator
   * gets a 403 from the mock exactly as they would from the server, and the
   * console's permission-denied state is reachable in dev.
   */
  /*
   * Notification campaigns (GoGo-BE#226). `ops_admin` in both directions.
   *
   * Nothing here reaches a provider: `schedule` writes a row and returns, the
   * way the real API does. There is deliberately no mock "send" either — the
   * worker is what sends, and pretending otherwise in dev would teach the
   * console the wrong shape.
   */
  http.get(`${BASE}/cms/campaigns`, ({ request }) => {
    const denied = requireOpsAdmin('campaigns are ops_admin only')
    if (denied) return denied
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const audienceType = url.searchParams.get('audienceType')
    const q = url.searchParams.get('q')?.toLowerCase()
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')

    let items = db.campaigns
    if (status) items = items.filter((row) => row.status === status)
    if (audienceType) items = items.filter((row) => row.audienceType === audienceType)
    if (q) items = items.filter((row) => row.name.toLowerCase().includes(q))
    return HttpResponse.json(pageOf(items, limit, cursor))
  }),

  http.post(`${BASE}/cms/campaigns`, async ({ request }) => {
    const denied = requireOpsAdmin('campaigns are ops_admin only')
    if (denied) return denied
    const body = (await request.json()) as Record<string, unknown>
    const name = String(body.name ?? '')
    if (db.campaigns.some((row) => row.name === name)) {
      return envelope(409, 'CAMPAIGN_NAME_TAKEN', 'a campaign with that name exists')
    }
    const created = {
      id: `cp-${db.campaigns.length + 100}`,
      name,
      title: String(body.title ?? ''),
      body: String(body.body ?? ''),
      imageKey: (body.imageKey as string) ?? null,
      ctaLabel: (body.ctaLabel as string) ?? null,
      audienceType: (body.audienceType as 'all') ?? 'all',
      audienceFilter: (body.audienceFilter as Record<string, unknown>) ?? {},
      destinationType: (body.destinationType as 'home') ?? 'home',
      destinationValue: (body.destinationValue as string) ?? null,
      // Always a draft: nothing is sent until it is scheduled.
      status: 'draft' as const,
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      recipientCount: null,
      sentCount: 0,
      failedCount: 0,
      lastError: null,
      testSendRequestedAt: null,
      testSendCompletedAt: null,
      createdByAdminId: 'adm-mock',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    db.campaigns.unshift(created)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.get(`${BASE}/cms/campaigns/:id`, ({ params }) => {
    const denied = requireOpsAdmin('campaigns are ops_admin only')
    if (denied) return denied
    const row = db.campaigns.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'campaign not found')
    return HttpResponse.json(row)
  }),

  http.patch(`${BASE}/cms/campaigns/:id`, async ({ params, request }) => {
    const denied = requireOpsAdmin('campaigns are ops_admin only')
    if (denied) return denied
    const row = db.campaigns.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'campaign not found')
    // Editing a scheduled campaign would silently change what is about to go
    // out; it has to be unscheduled first.
    if (!EDITABLE_CAMPAIGN_STATUSES.includes(row.status)) {
      return envelope(409, 'CAMPAIGN_NOT_EDITABLE', 'not in an editable state')
    }
    const body = (await request.json()) as Record<string, unknown>
    for (const key of [
      'name',
      'title',
      'body',
      'imageKey',
      'ctaLabel',
      'audienceType',
      'audienceFilter',
      'destinationType',
      'destinationValue',
    ] as const) {
      if (body[key] !== undefined) (row as Record<string, unknown>)[key] = body[key]
    }
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json(row)
  }),

  http.get(`${BASE}/cms/campaigns/:id/audience-estimate`, ({ params }) => {
    const denied = requireOpsAdmin('campaigns are ops_admin only')
    if (denied) return denied
    const row = db.campaigns.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'campaign not found')
    // A read with no side effect. Counts only accounts with a registered
    // device, which is why it is smaller than any "total users" number.
    const base = { all: 21480, couple: 9260, group: 6140, platform: 11890 }
    return HttpResponse.json({
      campaignId: row.id,
      audienceType: row.audienceType,
      estimatedRecipients: base[row.audienceType],
      estimatedAt: new Date().toISOString(),
    })
  }),

  http.post(`${BASE}/cms/campaigns/:id/schedule`, async ({ params, request }) => {
    const denied = requireOpsAdmin('campaigns are ops_admin only')
    if (denied) return denied
    const row = db.campaigns.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'campaign not found')
    if (!EDITABLE_CAMPAIGN_STATUSES.includes(row.status)) {
      return envelope(409, 'INVALID_STATUS_TRANSITION', 'not schedulable from here')
    }
    const body = (await request.json().catch(() => ({}))) as { sendAt?: string }
    row.status = 'scheduled'
    // Omitting `sendAt` means now; the worker picks it up on its next tick.
    row.scheduledAt = body.sendAt ?? new Date().toISOString()
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json(row, { status: 201 })
  }),

  http.post(`${BASE}/cms/campaigns/:id/cancel`, ({ params }) => {
    const denied = requireOpsAdmin('campaigns are ops_admin only')
    if (denied) return denied
    const row = db.campaigns.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'campaign not found')
    if (row.status === 'sending') {
      return envelope(
        409,
        'CAMPAIGN_ALREADY_SENDING',
        `sending has started; ${row.sentCount} already delivered`,
      )
    }
    if (row.status !== 'scheduled') {
      return envelope(409, 'INVALID_STATUS_TRANSITION', 'not cancellable from here')
    }
    row.status = 'cancelled'
    row.scheduledAt = null
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json(row, { status: 201 })
  }),

  http.post(`${BASE}/cms/campaigns/:id/test-send`, ({ params }) => {
    const denied = requireOpsAdmin('campaigns are ops_admin only')
    if (denied) return denied
    const row = db.campaigns.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'campaign not found')
    // Never changes `status`: a test reaches exactly one account, the
    // caller's own.
    row.testSendRequestedAt = new Date().toISOString()
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json(
      { campaignId: row.id, status: row.status, testSendQueued: true },
      { status: 201 },
    )
  }),

  /*
   * CMS-scoped presigned upload (GoGo-BE#227).
   *
   * Returns a URL, never a storage credential. `readUrl` is null here on
   * purpose: media hosting is not configured in dev, and the console has to
   * render that absence rather than a URL that would 404.
   */
  http.post(`${BASE}/cms/uploads`, async ({ request }) => {
    const { role } = currentActor()
    if (role !== 'editor' && role !== 'ops_admin' && role !== 'super_admin') {
      return envelope(403, 'FORBIDDEN', 'uploads are editor/ops only')
    }
    const body = (await request.json()) as {
      purpose?: string
      contentType?: string
      contentLength?: number
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
    if (!body.contentType || !allowed.includes(body.contentType)) {
      return envelope(400, 'UNSUPPORTED_CONTENT_TYPE', 'content type not allowed')
    }
    const maxBytes = 10 * 1024 * 1024
    if (Number(body.contentLength ?? 0) > maxBytes) {
      return envelope(400, 'FILE_TOO_LARGE', 'over the size ceiling')
    }
    const id = `up-${db.uploads.length + 1}`
    // Server-generated from actor + a UUID, never anything the client sent.
    const key = `cms/${body.purpose}/adm-mock/${id}`
    db.uploads.push(key)
    return HttpResponse.json(
      {
        id,
        key,
        uploadUrl: `https://storage.gogo.test/put/${id}`,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        maxBytes,
        contentType: body.contentType,
        readUrl: null,
      },
      { status: 201 },
    )
  }),

  /* The presigned PUT itself. Storage, not the API — so no envelope. */
  http.put('https://storage.gogo.test/put/*', () => new HttpResponse(null, { status: 200 })),

  /*
   * Banner images the fixtures point at.
   *
   * Served rather than left to fail: an `<img>` whose src does not resolve is
   * a broken image in dev and a console error in the smoke test, which is
   * exactly the state rule 15 says a card must never be in. One transparent
   * pixel is enough to prove the element renders.
   */
  http.get('https://images.gogo.test/*', () => {
    const pixel = Uint8Array.from(atob(TRANSPARENT_PNG), (char) => char.charCodeAt(0))
    return new HttpResponse(pixel, { headers: { 'Content-Type': 'image/png' } })
  }),

  /*
   * Banners (GoGo-BE#224). `status` filters on the EFFECTIVE status, which
   * includes `expired` — computed, never stored.
   */
  http.get(`${BASE}/cms/banners`, ({ request }) => {
    const url = new URL(request.url)
    const placement = url.searchParams.get('placement')
    const status = url.searchParams.get('status')
    const audience = url.searchParams.get('audience')
    const q = url.searchParams.get('q')?.toLowerCase()
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')

    let items = db.banners.map((row) => ({ ...row, status: effectiveBannerStatus(row) }))
    if (placement) items = items.filter((row) => row.placement === placement)
    if (status) items = items.filter((row) => row.status === status)
    if (audience) items = items.filter((row) => row.audience === audience)
    if (q) items = items.filter((row) => row.name.toLowerCase().includes(q))
    return HttpResponse.json(pageOf(items, limit, cursor))
  }),

  http.post(`${BASE}/cms/banners`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const name = String(body.name ?? '')
    if (db.banners.some((row) => row.name === name)) {
      return envelope(409, 'BANNER_NAME_TAKEN', 'a banner with that name exists')
    }
    const imageKey = String(body.imageKey ?? '')
    // A key must have been issued by this session's upload call; anything else
    // would become a broken image.
    if (!imageKey || !db.uploads.includes(imageKey)) {
      return envelope(400, 'INVALID_UPLOAD_KEY', 'image key is not usable')
    }
    const created = {
      id: `bn-${db.banners.length + 100}`,
      name,
      imageKey,
      imageUrl: null,
      title: (body.title as string) ?? null,
      subtitle: (body.subtitle as string) ?? null,
      ctaLabel: (body.ctaLabel as string) ?? null,
      destinationType: (body.destinationType as 'none') ?? 'none',
      destinationValue: (body.destinationValue as string) ?? null,
      audience: (body.audience as 'couple') ?? null,
      placement: body.placement as 'home_hero',
      startsAt: (body.startsAt as string) ?? null,
      endsAt: (body.endsAt as string) ?? null,
      priority: Number(body.priority ?? 0),
      status: 'draft' as const,
      lifecycleStatus: 'draft' as const,
      createdByAdminId: 'adm-mock',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    db.banners.unshift(created)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.get(`${BASE}/cms/banners/:id`, ({ params }) => {
    const row = db.banners.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'banner not found')
    return HttpResponse.json({ ...row, status: effectiveBannerStatus(row) })
  }),

  http.patch(`${BASE}/cms/banners/:id`, async ({ params, request }) => {
    const row = db.banners.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'banner not found')
    const body = (await request.json()) as Record<string, unknown>
    const startsAt = (body.startsAt as string) ?? row.startsAt
    const endsAt = (body.endsAt as string) ?? row.endsAt
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      return envelope(400, 'INVALID_SCHEDULE', 'the window is inverted')
    }
    const destinationType =
      (body.destinationType as typeof row.destinationType) ?? row.destinationType
    const destinationValue =
      body.destinationValue !== undefined
        ? String(body.destinationValue)
        : (row.destinationValue ?? '')
    if (destinationType !== 'none' && destinationValue.trim() === '') {
      return envelope(400, 'INVALID_DESTINATION', 'this destination type needs a value')
    }
    for (const key of [
      'name',
      'imageKey',
      'title',
      'subtitle',
      'ctaLabel',
      'audience',
      'placement',
      'startsAt',
      'endsAt',
    ] as const) {
      if (body[key] !== undefined) (row as Record<string, unknown>)[key] = body[key]
    }
    row.destinationType = destinationType
    row.destinationValue = destinationType === 'none' ? null : destinationValue
    if (body.priority !== undefined) row.priority = Number(body.priority)
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json({ ...row, status: effectiveBannerStatus(row) })
  }),

  http.patch(`${BASE}/cms/banners/:id/status`, async ({ params, request }) => {
    const row = db.banners.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'banner not found')
    const body = (await request.json()) as { status: string }
    if (body.status === 'scheduled' && !row.startsAt) {
      return envelope(400, 'SCHEDULE_REQUIRED', 'scheduling needs a start time')
    }
    if (body.status === 'published' && row.endsAt && new Date(row.endsAt) <= new Date()) {
      // Publishing a closed window would produce something the very next read
      // reports as expired.
      return envelope(400, 'WINDOW_CLOSED', 'the window has already closed')
    }
    row.lifecycleStatus = body.status as typeof row.lifecycleStatus
    row.status = effectiveBannerStatus(row)
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json({ id: row.id, status: row.lifecycleStatus })
  }),

  /*
   * App users (GoGo-BE#246). ops_admin+ and outside rank-read, like the
   * server. Suspend/ban/reactivate refuse a deleted account with USER_DELETED
   * — deleted is terminal.
   */
  http.get(`${BASE}/cms/users`, ({ request }) => {
    const denied = requireOpsAdmin('the user base is ops_admin and above')
    if (denied) return denied
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const status = url.searchParams.get('status')
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')
    let items = db.appUsers
    if (status) items = items.filter((row) => row.status === status)
    if (q) {
      items = items.filter(
        (row) =>
          row.displayName.toLowerCase().includes(q) || (row.email ?? '').toLowerCase().includes(q),
      )
    }
    const page = pageOf(items, limit, cursor)
    // The list shape has no rooms/statusReason; only the detail carries them.
    return HttpResponse.json({
      ...page,
      items: page.items.map((item) => {
        // The list shape omits detail-only fields.
        const row: Record<string, unknown> = { ...item }
        delete row.rooms
        delete row.statusReason
        delete row.statusChangedAt
        return row
      }),
    })
  }),

  http.get(`${BASE}/cms/users/:id`, ({ params }) => {
    const denied = requireOpsAdmin('the user base is ops_admin and above')
    if (denied) return denied
    const row = db.appUsers.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'user not found')
    return HttpResponse.json(row)
  }),

  http.post(`${BASE}/cms/users/:id/suspend`, async ({ params, request }) =>
    userStatusAction(params.id as string, request, 'suspended'),
  ),
  http.post(`${BASE}/cms/users/:id/ban`, async ({ params, request }) =>
    userStatusAction(params.id as string, request, 'banned'),
  ),
  http.post(`${BASE}/cms/users/:id/reactivate`, async ({ params, request }) =>
    userStatusAction(params.id as string, request, 'active'),
  ),

  http.post(`${BASE}/cms/users/:id/delete`, async ({ params, request }) => {
    const denied = requireOpsAdmin('deletion is super_admin only')
    if (denied) return denied
    const { role } = currentActor()
    if (role !== 'super_admin') return envelope(403, 'FORBIDDEN', 'deletion is super_admin only')
    const row = db.appUsers.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'user not found')
    const body = (await request.json()) as { reason?: string }
    if (!body.reason || body.reason.trim().length < 3) {
      return envelope(400, 'BAD_REQUEST', 'reason required')
    }
    // Same erasure as the consumer flow: PII nulled, address freed. Idempotent.
    row.status = 'deleted'
    row.email = null
    row.lastActiveAt = null
    row.rooms = []
    return HttpResponse.json({ deleted: true }, { status: 201 })
  }),

  http.post(`${BASE}/cms/users/:id/export`, async ({ params, request }) => {
    const denied = requireOpsAdmin('the user base is ops_admin and above')
    if (denied) return denied
    const row = db.appUsers.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'user not found')
    const body = (await request.json()) as { reason?: string }
    if (!body.reason || body.reason.trim().length < 3) {
      return envelope(400, 'BAD_REQUEST', 'reason required')
    }
    // Same payload as /me/export; the audit entry is the point.
    return HttpResponse.json(
      { profile: { displayName: row.displayName, email: row.email }, reviews: [], savedPlaces: [] },
      { status: 201 },
    )
  }),

  http.get(`${BASE}/cms/rooms`, ({ request }) => {
    const denied = requireOpsAdmin('the user base is ops_admin and above')
    if (denied) return denied
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')
    let items = cmsRooms
    if (status) items = items.filter((row) => row.status === status)
    return HttpResponse.json(pageOf(items, limit, cursor))
  }),

  /*
   * Privacy-request ledger (GoGo-BE#255). The mock enforces the refusals the
   * contract names, so the console's explanations are reachable in dev:
   * correction cannot execute, delete needs super_admin, a hold needs a
   * closed row and a future review date.
   */
  http.get(`${BASE}/cms/privacy-requests`, ({ request }) => {
    const denied = requireOpsAdmin('the privacy ledger is ops_admin and above')
    if (denied) return denied
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const type = url.searchParams.get('type')
    const sla = url.searchParams.get('sla')
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')
    let items = db.privacy
    if (status) items = items.filter((row) => row.status === status)
    if (type) items = items.filter((row) => row.type === type)
    // Filtered against the same stored `sla` the badge renders.
    if (sla === 'overdue') items = items.filter((row) => row.sla === 'OVERDUE')
    if (sla === 'due_soon') items = items.filter((row) => row.sla === 'DUE_SOON')
    return HttpResponse.json(pageOf(items, limit, cursor))
  }),

  http.post(`${BASE}/cms/privacy-requests`, async ({ request }) => {
    const denied = requireOpsAdmin('the privacy ledger is ops_admin and above')
    if (denied) return denied
    const body = (await request.json()) as Record<string, unknown>
    const created = {
      ...db.privacy[0]!,
      id: `66666666-0000-4000-8000-00000000${String(db.privacy.length + 10).padStart(4, '0')}`,
      type: (body.type as 'export') ?? 'export',
      source: 'support' as const,
      status: 'open' as const,
      outcome: null,
      subject: {
        subjectType: (body.subjectType as 'email') ?? 'email',
        userId: (body.userId as string) ?? null,
        contactEmail: (body.contactEmail as string) ?? null,
        externalReference: (body.externalReference as string) ?? null,
        identityStatus: body.userId ? ('matched' as const) : ('unverified' as const),
      },
      receivedAt: new Date().toISOString(),
      acknowledgedAt: null,
      closedAt: null,
      executedAt: null,
      retentionHold: null,
      operatorNote: (body.operatorNote as string) ?? null,
      sla: 'ON_TRACK' as const,
    }
    db.privacy.unshift(created)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.get(`${BASE}/cms/privacy-requests/:id`, ({ params }) => {
    const denied = requireOpsAdmin('the privacy ledger is ops_admin and above')
    if (denied) return denied
    const row = db.privacy.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'privacy request not found')
    return HttpResponse.json(row)
  }),

  http.post(`${BASE}/cms/privacy-requests/:id/acknowledge`, ({ params }) => {
    const row = db.privacy.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'privacy request not found')
    if (row.status === 'closed') return envelope(409, 'ALREADY_CLOSED', 'already closed')
    row.status = 'acknowledged'
    row.acknowledgedAt = new Date().toISOString()
    return HttpResponse.json(row, { status: 201 })
  }),

  http.post(`${BASE}/cms/privacy-requests/:id/execute`, ({ params }) => {
    const row = db.privacy.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'privacy request not found')
    if (row.status === 'closed') return envelope(409, 'ALREADY_CLOSED', 'already closed')
    if (row.type === 'correction') {
      return envelope(409, 'NOT_EXECUTABLE', 'correction requests are worked by hand')
    }
    if (row.subject.identityStatus !== 'matched') {
      return envelope(409, 'IDENTITY_NOT_MATCHED', 'match the request to an account first')
    }
    const { role } = currentActor()
    if (row.type === 'delete' && role !== 'super_admin') {
      return envelope(403, 'ROLE_DENIED', 'a delete request needs super_admin')
    }
    row.status = 'closed'
    row.outcome = 'completed'
    row.executedAt = new Date().toISOString()
    row.completedAt = row.executedAt
    row.closedAt = row.executedAt
    return HttpResponse.json(
      row.type === 'export'
        ? { request: row, data: { profile: {}, reviews: [], savedPlaces: [] } }
        : { request: row },
      { status: 201 },
    )
  }),

  http.post(`${BASE}/cms/privacy-requests/:id/close`, async ({ params, request }) => {
    const row = db.privacy.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'privacy request not found')
    if (row.status === 'closed') return envelope(409, 'ALREADY_CLOSED', 'already closed')
    const body = (await request.json()) as { outcome?: string; operatorNote?: string }
    row.status = 'closed'
    row.outcome = (body.outcome as 'rejected') ?? 'rejected'
    row.closedAt = new Date().toISOString()
    if (body.operatorNote) row.operatorNote = body.operatorNote
    return HttpResponse.json(row, { status: 201 })
  }),

  http.post(`${BASE}/cms/privacy-requests/:id/delivered`, async ({ params, request }) => {
    const row = db.privacy.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'privacy request not found')
    if (row.type !== 'export') return envelope(409, 'NOT_AN_EXPORT', 'not an export')
    const body = (await request.json()) as { deliveryMethod?: string }
    row.deliveryMethod = (body.deliveryMethod as 'secure_download') ?? 'secure_download'
    row.deliveredAt = new Date().toISOString()
    return HttpResponse.json(row, { status: 201 })
  }),

  http.post(`${BASE}/cms/privacy-requests/:id/retention-hold`, async ({ params, request }) => {
    const { role } = currentActor()
    if (role !== 'super_admin') return envelope(403, 'FORBIDDEN', 'holds are super_admin only')
    const row = db.privacy.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'privacy request not found')
    if (row.status !== 'closed') return envelope(409, 'NOT_CLOSED', 'only a closed request')
    if (row.retentionHold) return envelope(409, 'ALREADY_HELD', 'already held')
    const body = (await request.json()) as {
      reason?: string
      legalBasis?: string
      reviewAt?: string
    }
    if (!body.reviewAt || new Date(body.reviewAt).getTime() <= Date.now()) {
      return envelope(400, 'REVIEW_IN_PAST', 'review date must be in the future')
    }
    row.retentionHold = {
      heldAt: new Date().toISOString(),
      heldBy: '00000000-0000-4000-8000-0000000000aa',
      reason: body.reason ?? '',
      legalBasis: body.legalBasis ?? '',
      reviewAt: body.reviewAt,
      holdUntil: null,
      reviewOverdue: false,
    }
    return HttpResponse.json(row, { status: 201 })
  }),

  http.post(
    `${BASE}/cms/privacy-requests/:id/retention-hold/release`,
    async ({ params, request }) => {
      const { role } = currentActor()
      if (role !== 'super_admin') return envelope(403, 'FORBIDDEN', 'holds are super_admin only')
      const row = db.privacy.find((item) => item.id === params.id)
      if (!row) return envelope(404, 'NOT_FOUND', 'privacy request not found')
      if (!row.retentionHold) return envelope(409, 'NOT_HELD', 'no hold on this request')
      const body = (await request.json()) as { reason?: string }
      if (!body.reason || body.reason.trim().length < 3) {
        return envelope(400, 'BAD_REQUEST', 'reason required')
      }
      row.retentionHold = null
      return HttpResponse.json(row, { status: 201 })
    },
  ),

  http.get(`${BASE}/cms/rooms/:id/guests`, ({ params }) => {
    const denied = requireOpsAdmin('the user base is ops_admin and above')
    if (denied) return denied
    // Removed guests stay listed: votes and reports reference the row.
    return HttpResponse.json({ guests: db.roomGuests[params.id as string] ?? [] })
  }),

  http.post(`${BASE}/cms/rooms/:id/guests/:memberId/remove`, async ({ params, request }) => {
    const denied = requireOpsAdmin('the user base is ops_admin and above')
    if (denied) return denied
    const guests = db.roomGuests[params.id as string] ?? []
    const guest = guests.find((row) => row.memberId === params.memberId)
    if (!guest) return envelope(404, 'NOT_FOUND', 'guest membership not found')
    const body = (await request.json()) as { reason?: string }
    if (!body.reason || body.reason.trim().length < 3) {
      return envelope(400, 'BAD_REQUEST', 'reason required')
    }
    if (guest.removedAt) return envelope(409, 'ALREADY_REMOVED', 'already removed')
    guest.removedAt = new Date().toISOString()
    guest.sessionRevokedAt = guest.removedAt
    return HttpResponse.json({ memberId: guest.memberId, removed: true }, { status: 201 })
  }),

  http.get(`${BASE}/cms/plans`, ({ request }) => {
    const denied = requireOpsAdmin('the user base is ops_admin and above')
    if (denied) return denied
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')
    let items = cmsPlans
    if (status) items = items.filter((row) => row.status === status)
    return HttpResponse.json(pageOf(items, limit, cursor))
  }),

  /*
   * Ops observability (GoGo-BE#247). Static snapshots: the mock's job is the
   * SHAPE — all four health states, a truncated failure floor, the outbox
   * row, and costs that honestly say "no source connected".
   */
  http.get(`${BASE}/cms/ops/health`, () => HttpResponse.json(opsHealth)),
  http.get(`${BASE}/cms/ops/queues`, () => HttpResponse.json(opsQueues)),
  /*
   * COST-CMS-009 (GoGo-BE#381). One endpoint, two shapes in one body: the
   * deprecated #335 keys the dashboard card still reads, and the v2 Cost
   * Center payload. They share no key, so neither strips the other — and the
   * window is echoed back so a test can prove the selector re-queries rather
   * than only repainting.
   */
  http.get(`${BASE}/cms/ops/costs`, ({ request }) => {
    const denied = requireOpsAdmin('operational cost is ops_admin and above')
    if (denied) return denied
    const window = new URL(request.url).searchParams.get('window') ?? 'mtd'
    return HttpResponse.json({ ...opsCosts, ...costOverview, window })
  }),

  http.get(
    `${BASE}/cms/ops/costs/providers/:providerId/services/:serviceId`,
    ({ params, request }) => {
      const denied = requireOpsAdmin('operational cost is ops_admin and above')
      if (denied) return denied
      const service = costServices[String(params.serviceId)]
      // The registry is data, so an unknown id is a 404 rather than a 400 —
      // and a service under the wrong provider is just as absent.
      if (!service || service.providerId !== String(params.providerId)) {
        return envelope(404, 'NOT_FOUND', 'no such service')
      }
      const window = new URL(request.url).searchParams.get('window') ?? 'mtd'
      return HttpResponse.json({
        window,
        service: { ...service, operations: costServiceOperations[service.serviceId] ?? [] },
      })
    },
  ),

  http.get(`${BASE}/cms/ops/costs/test-runs`, ({ request }) => {
    const denied = requireOpsAdmin('operational cost is ops_admin and above')
    if (denied) return denied
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 20)
    return HttpResponse.json({ testRuns: costTestRuns.slice(0, limit) })
  }),

  http.get(`${BASE}/cms/ops/costs/test-runs/:id`, ({ params }) => {
    const denied = requireOpsAdmin('operational cost is ops_admin and above')
    if (denied) return denied
    const run = costTestRunDetails[String(params.id)]
    if (!run) return envelope(404, 'NOT_FOUND', 'no such run')
    return HttpResponse.json({ testRun: run })
  }),

  /*
   * COST-CMS-010 (GoGo-BE#382). Manual cost items — the mock's job is the
   * contract: `eligibleServices` from the registry, the field-error shape on
   * a refused write, the Idempotency-Key replay on create, and an audit row
   * per write so the trail on the screen has something to show.
   */
  http.get(`${BASE}/cms/ops/costs/manual-items`, () =>
    HttpResponse.json({
      items: db.manualCosts,
      eligibleServices: cmsManualCostEligibleServices,
    }),
  ),
  http.post(`${BASE}/cms/ops/costs/manual-items`, async ({ request }) => {
    const key = request.headers.get('idempotency-key')
    const replay = key ? db.manualCostKeys.get(key) : undefined
    if (replay) return HttpResponse.json({ item: replay }, { status: 201 })
    const body = (await request.json()) as Record<string, unknown>
    const refused = refuseManualCost(body)
    if (refused) return refused
    const now = new Date().toISOString()
    const item: (typeof cmsManualCostItems)[number] = {
      id: `mc-${db.manualCosts.length + 100}`,
      environment: 'dev',
      providerId: String(body.providerId),
      serviceId: String(body.serviceId),
      name: String(body.name),
      amountMicros: Number(body.amountMicros),
      currency: String(body.currency ?? 'USD'),
      period: body.period as 'MONTHLY',
      // COST-CMS-012: the server derives the classification and the next billing day.
      costKind: body.period === 'ONE_TIME' ? 'ONE_TIME' : 'RECURRING',
      billingCadence:
        body.period === 'ONE_TIME' ? null : body.period === 'YEARLY' ? 'ANNUAL' : 'MONTHLY',
      nextChargeDay: body.period === 'ONE_TIME' ? null : String(body.effectiveFrom),
      effectiveFrom: String(body.effectiveFrom),
      effectiveTo: (body.effectiveTo as string | null | undefined) ?? null,
      note: (body.note as string | null | undefined) ?? null,
      createdBy: 'adm-mock',
      createdAt: now,
      updatedBy: 'adm-mock',
      updatedAt: now,
    }
    db.manualCosts.unshift(item)
    if (key) db.manualCostKeys.set(key, item)
    recordManualCostAudit('cost.manual_item.created', item.id, { after: body })
    return HttpResponse.json({ item }, { status: 201 })
  }),
  http.get(`${BASE}/cms/ops/costs/manual-items/:id`, ({ params }) => {
    const item = db.manualCosts.find((row) => row.id === params.id)
    if (!item) return envelope(404, 'COST_MANUAL_ITEM_NOT_FOUND', 'no such item')
    return HttpResponse.json({ item })
  }),
  http.patch(`${BASE}/cms/ops/costs/manual-items/:id`, async ({ params, request }) => {
    const item = db.manualCosts.find((row) => row.id === params.id)
    if (!item) return envelope(404, 'COST_MANUAL_ITEM_NOT_FOUND', 'no such item')
    const body = (await request.json()) as Record<string, unknown>
    // The merged item is validated whole, as the server does.
    const merged = { ...item, ...body } as Record<string, unknown>
    const refused = refuseManualCost(merged)
    if (refused) return refused
    const changed: Record<string, { before: unknown; after: unknown }> = {}
    for (const key of Object.keys(body)) {
      const current = (item as Record<string, unknown>)[key]
      if (current !== body[key]) {
        changed[key] = { before: current, after: body[key] }
        ;(item as Record<string, unknown>)[key] = body[key]
      }
    }
    item.updatedAt = new Date().toISOString()
    if (Object.keys(changed).length > 0) {
      recordManualCostAudit('cost.manual_item.updated', item.id, { changed })
    }
    return HttpResponse.json({ item })
  }),
  http.delete(`${BASE}/cms/ops/costs/manual-items/:id`, ({ params }) => {
    const index = db.manualCosts.findIndex((row) => row.id === params.id)
    if (index < 0) return envelope(404, 'COST_MANUAL_ITEM_NOT_FOUND', 'no such item')
    const [gone] = db.manualCosts.splice(index, 1)
    recordManualCostAudit('cost.manual_item.deleted', String(params.id), { before: gone })
    return HttpResponse.json({ deleted: true })
  }),
  // GoGo-BE#315. The window is echoed back so a test can prove the selector
  // actually re-queries rather than only repainting.
  http.get(`${BASE}/cms/ops/summary`, ({ request }) => {
    const window = new URL(request.url).searchParams.get('window') ?? '24h'
    const truncated = window === '30d'
    return HttpResponse.json({
      ...opsSummary,
      window,
      effectiveWindow: truncated ? '14d' : window,
      truncated,
    })
  }),
  http.get(`${BASE}/cms/ops/providers`, ({ request }) => {
    const window = new URL(request.url).searchParams.get('window') ?? '24h'
    return HttpResponse.json({ ...opsProviders, window, effectiveWindow: window })
  }),

  http.get(`${BASE}/cms/safety-rules`, ({ request }) => {
    const denied = requireOpsAdmin()
    if (denied) return denied
    const url = new URL(request.url)
    const ruleType = url.searchParams.get('ruleType')
    const status = url.searchParams.get('status')
    const action = url.searchParams.get('action')
    const severity = url.searchParams.get('severity')
    const trigger = url.searchParams.get('trigger')
    const q = url.searchParams.get('q')?.toLowerCase()
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')

    let items = db.safetyRules
    if (ruleType) items = items.filter((row) => row.ruleType === ruleType)
    if (status) items = items.filter((row) => row.status === status)
    if (action) items = items.filter((row) => row.action === action)
    if (severity) items = items.filter((row) => row.severity === severity)
    if (trigger) items = items.filter((row) => row.trigger === trigger)
    if (q) {
      items = items.filter(
        (row) => row.name.toLowerCase().includes(q) || row.reasonCode.toLowerCase().includes(q),
      )
    }
    return HttpResponse.json(pageOf(items, limit, cursor))
  }),

  http.post(`${BASE}/cms/safety-rules`, async ({ request }) => {
    const denied = requireOpsAdmin()
    if (denied) return denied
    const body = (await request.json()) as Record<string, unknown>
    const name = String(body.name ?? '')
    if (db.safetyRules.some((row) => row.name === name)) {
      return envelope(409, 'RULE_NAME_TAKEN', 'a rule with that name exists')
    }
    const ruleType = body.ruleType as (typeof cmsSafetyRules)[number]['ruleType']
    const action = body.action as (typeof cmsSafetyRules)[number]['action']
    const severity = (body.severity as (typeof cmsSafetyRules)[number]['severity']) ?? 'medium'
    // The three checks the contract names, so the console cannot ship a form
    // that only discovers them in production.
    if (!ALLOWED_ACTIONS[ruleType]?.includes(action)) {
      return envelope(400, 'ACTION_NOT_ALLOWED', 'action not available for this rule type')
    }
    const triggers: readonly string[] = ALLOWED_TRIGGERS[ruleType] ?? []
    if (!triggers.includes(String(body.trigger))) {
      return envelope(400, 'TRIGGER_NOT_ALLOWED', 'trigger not available for this rule type')
    }
    if (action === 'suspend_user' && severity !== 'high' && severity !== 'critical') {
      return envelope(400, 'SEVERITY_TOO_LOW', 'automatic suspension needs high severity')
    }
    const created = {
      id: `sr-${db.safetyRules.length + 100}`,
      name,
      description: (body.description as string) ?? null,
      ruleType,
      trigger: body.trigger as (typeof cmsSafetyRules)[number]['trigger'],
      conditions: (body.conditions as Record<string, unknown>) ?? {},
      action,
      severity,
      // Always a draft: arming a rule is a separate, deliberate act.
      status: 'draft' as const,
      priority: Number(body.priority ?? 0),
      reasonCode: String(body.reasonCode ?? ''),
      createdBy: { id: 'adm-ops', displayName: 'Ngô Ops' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    db.safetyRules.unshift(created)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.get(`${BASE}/cms/safety-rules/:id`, ({ params }) => {
    const denied = requireOpsAdmin()
    if (denied) return denied
    const row = db.safetyRules.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'safety rule not found')
    return HttpResponse.json(row)
  }),

  http.patch(`${BASE}/cms/safety-rules/:id`, async ({ params, request }) => {
    const denied = requireOpsAdmin()
    if (denied) return denied
    const row = db.safetyRules.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'safety rule not found')
    const body = (await request.json()) as Record<string, unknown>
    // `ruleType` is immutable — it decides how the stored conditions read.
    if (body.ruleType !== undefined && body.ruleType !== row.ruleType) {
      return envelope(400, 'BAD_REQUEST', 'ruleType is immutable')
    }
    const action = (body.action as typeof row.action) ?? row.action
    const severity = (body.severity as typeof row.severity) ?? row.severity
    if (!ALLOWED_ACTIONS[row.ruleType]?.includes(action)) {
      return envelope(400, 'ACTION_NOT_ALLOWED', 'action not available for this rule type')
    }
    if (action === 'suspend_user' && severity !== 'high' && severity !== 'critical') {
      return envelope(400, 'SEVERITY_TOO_LOW', 'automatic suspension needs high severity')
    }
    for (const key of ['name', 'description', 'trigger', 'reasonCode'] as const) {
      if (body[key] !== undefined) (row as Record<string, unknown>)[key] = body[key]
    }
    if (body.conditions !== undefined) {
      row.conditions = body.conditions as typeof row.conditions
    }
    if (body.priority !== undefined) row.priority = Number(body.priority)
    row.action = action
    row.severity = severity
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json(row)
  }),

  http.patch(`${BASE}/cms/safety-rules/:id/status`, async ({ params, request }) => {
    const denied = requireOpsAdmin()
    if (denied) return denied
    const row = db.safetyRules.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'safety rule not found')
    const body = (await request.json()) as { status: string }
    // Nothing here is terminal: the point of a switch is that it goes back.
    row.status = body.status as typeof row.status
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json({ id: row.id, status: row.status })
  }),

  http.get(`${BASE}/cms/recommendations`, ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const audience = url.searchParams.get('audience')
    const q = url.searchParams.get('q')?.toLowerCase()
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')

    let items = db.recommendations
    if (status) items = items.filter((row) => row.status === status)
    if (audience) items = items.filter((row) => row.audience === audience)
    if (q) {
      items = items.filter(
        (row) =>
          row.internalName.toLowerCase().includes(q) ||
          row.title.toLowerCase().includes(q) ||
          row.slug.toLowerCase().includes(q),
      )
    }
    const page = pageOf(items, limit, cursor)
    // The list shape omits `places`; only the detail carries them.
    return HttpResponse.json({
      ...page,
      items: page.items.map(({ places, ...row }) => ({ ...row, placeCount: places.length })),
    })
  }),

  http.post(`${BASE}/cms/recommendations`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const slug = String(body.slug ?? '')
    if (db.recommendations.some((row) => row.slug === slug)) {
      return envelope(409, 'SLUG_TAKEN', 'internal key already used')
    }
    const created = {
      id: `rec-${db.recommendations.length + 100}`,
      slug,
      locale: String(body.locale ?? 'vi'),
      internalName: String(body.internalName ?? ''),
      title: String(body.title ?? ''),
      subtitle: (body.subtitle as string) ?? null,
      description: (body.description as string) ?? null,
      audience: (body.audience as 'couple') ?? 'couple',
      areaKey: (body.areaKey as string) ?? null,
      priority: Number(body.priority ?? 0),
      status: 'draft' as const,
      startsAt: null,
      endsAt: null,
      placeCount: 0,
      taxonomies: [],
      createdByAdminId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      places: [],
    }
    db.recommendations.unshift(created)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.get(`${BASE}/cms/recommendations/:id`, ({ params }) => {
    const row = db.recommendations.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'recommendation not found')
    return HttpResponse.json(row)
  }),

  http.patch(`${BASE}/cms/recommendations/:id`, async ({ params, request }) => {
    const row = db.recommendations.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'recommendation not found')
    const body = (await request.json()) as Record<string, unknown>
    // Omitted fields are left alone, exactly as the contract states.
    for (const key of [
      'internalName',
      'title',
      'subtitle',
      'description',
      'areaKey',
      'audience',
    ] as const) {
      if (body[key] !== undefined) (row as Record<string, unknown>)[key] = body[key]
    }
    if (body.priority !== undefined) row.priority = Number(body.priority)
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json(row)
  }),

  http.patch(`${BASE}/cms/recommendations/:id/status`, async ({ params, request }) => {
    const row = db.recommendations.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'recommendation not found')
    const body = (await request.json()) as { status: string }
    if (row.status === 'archived') {
      return envelope(409, 'INVALID_STATUS_TRANSITION', 'archived is terminal')
    }
    if (body.status === 'published' && row.places.length === 0) {
      return envelope(400, 'EMPTY_RECOMMENDATION', 'publishing needs at least one place')
    }
    if (body.status === 'scheduled' && !row.startsAt) {
      return envelope(400, 'SCHEDULE_REQUIRED', 'scheduling needs a start time')
    }
    row.status = body.status as typeof row.status
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json({ id: row.id, status: row.status })
  }),

  http.put(`${BASE}/cms/recommendations/:id/places`, async ({ params, request }) => {
    const row = db.recommendations.find((item) => item.id === params.id)
    if (!row) return envelope(404, 'NOT_FOUND', 'recommendation not found')
    const body = (await request.json()) as { placeIds: string[] }
    const ids = body.placeIds ?? []
    if (new Set(ids).size !== ids.length) {
      return envelope(400, 'DUPLICATE_PLACE', 'a place appears twice')
    }
    row.places = ids
      .map((placeId, position) => {
        const known = db.places.find((place) => place.id === placeId)
        if (!known) return null
        return {
          position,
          placeId,
          name: known.name,
          addressText: known.addressText ?? null,
          status: known.status,
        }
      })
      .filter((place): place is NonNullable<typeof place> => place !== null)
    if (row.places.length !== ids.length) {
      return envelope(400, 'PLACE_NOT_FOUND', 'unknown place')
    }
    row.placeCount = row.places.length
    row.updatedAt = new Date().toISOString()
    return HttpResponse.json(row)
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

  http.get(`${BASE}/cms/feature-flags/catalog`, () => HttpResponse.json(featureFlagCatalog)),

  http.get(`${BASE}/cms/feature-flags`, ({ request }) => {
    const url = new URL(request.url)
    const environment = url.searchParams.get('environment')
    const platform = url.searchParams.get('platform')
    let items = db.flags
    // `all` rows always apply, so a scoped read returns them alongside the
    // narrower ones — that is what the console resolves over.
    if (environment && environment !== 'all') {
      items = items.filter((flag) => flag.environment === 'all' || flag.environment === environment)
    }
    if (platform && platform !== 'all') {
      items = items.filter((flag) => flag.platform === 'all' || flag.platform === platform)
    }
    return HttpResponse.json(items)
  }),

  /*
   * `PUT /cms/feature-flags/{key}`. The mock enforces what the contract says
   * the server enforces, so the console cannot pass here and fail in
   * production: an unknown key is a 404, a value is validated against the
   * key's declared type, and a per-platform write to a key that is not
   * platform-scoped is refused rather than stored and ignored.
   */
  http.put(`${BASE}/cms/feature-flags/:key`, async ({ params, request }) => {
    const definition = featureFlagCatalog.find((item) => item.key === params.key)
    if (!definition) return envelope(404, 'NOT_FOUND', 'flag not found')

    const body = (await request.json()) as {
      enabled: boolean
      value?: unknown
      environment?: string
      platform?: string
    }
    const environment = (body.environment ?? 'all') as (typeof db.flags)[number]['environment']
    const platform = (body.platform ?? 'all') as (typeof db.flags)[number]['platform']

    if (!definition.platformScoped && platform !== 'all') {
      return envelope(400, 'VALIDATION_FAILED', 'key is not platform scoped')
    }
    if (definition.valueType === 'number' && typeof body.value !== 'number') {
      return envelope(400, 'VALIDATION_FAILED', 'value must be a number')
    }
    if (definition.valueType === 'version' && !/^\d+\.\d+\.\d+$/.test(String(body.value ?? ''))) {
      return envelope(400, 'VALIDATION_FAILED', 'value must look like 1.2.3')
    }

    const existing = db.flags.find(
      (item) =>
        item.key === params.key && item.environment === environment && item.platform === platform,
    )
    const row = existing ?? {
      key: String(params.key),
      valueType: definition.valueType,
      environment,
      platform,
      enabled: body.enabled,
      value: body.value ?? null,
      payload: null,
      description: definition.description,
      known: true,
      updatedBy: null,
      updatedAt: new Date().toISOString(),
    }
    row.enabled = body.enabled
    row.value = definition.valueType === 'boolean' ? body.enabled : (body.value ?? null)
    row.updatedBy = { id: 'ad-me', displayName: currentActor().displayName }
    row.updatedAt = new Date().toISOString()
    if (!existing) db.flags.push(row)

    return HttpResponse.json({
      key: row.key,
      valueType: row.valueType,
      environment: row.environment,
      platform: row.platform,
      enabled: row.enabled,
      value: row.value,
    })
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
