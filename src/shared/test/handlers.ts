import { http, HttpResponse } from 'msw'
import type { z } from 'zod'
import type { AdminRole, AuditEntry, CollectionStatus, PlaceStatus } from '@/shared/api/contracts'
import {
  cmsPlaceEditMockSchema,
  cmsPlaceHoursSchema,
  cmsPlaceMediaAttachSchema,
  cmsPlaceMediaPatchSchema,
  mockHoursIssues,
  moderationReasonMissing,
  toFieldErrors,
} from '@/shared/api/cmsPlaceContract'
import { ALLOWED_ACTIONS, ALLOWED_TRIGGERS } from '@/features/safety/conditions'
import type { ImportRow } from '@/shared/api/contracts-import'
import {
  costOverview,
  costServiceOperations,
  costServices,
  costTestRunDetails,
  costTestRuns,
  auditEntries,
  cmsAreas,
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

/**
 * #469 — the branches `resolve-link` offers when a link names no one place, so
 * a picked one reads back as itself rather than as the generic fixture.
 */
const BRANCH_NAMES: Record<string, string> = {
  ChIJa: 'Highlands Coffee',
  ChIJb: 'Highlands Coffee Hai Bà Trưng',
}

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
/**
 * A `media_uploads` row, as much of it as the console can observe.
 *
 * `owner` stands in for `actor_id`: the mock has no user ids, and the display
 * name is what `currentActor()` can tell apart, which is all the attach check
 * needs to refuse somebody else's key.
 */
type MockUpload = {
  id: string
  key: string
  purpose: string
  contentType: string
  contentLength: number
  status: 'pending' | 'attached'
  owner: string
  createdAt: string
}

/**
 * Where an object is readable. Mirrors `CmsPlaceMediaService#readUrl`: a base
 * URL configured for the environment, or null — an honest absence rather than
 * a URL that would 404.
 */
const MEDIA_PUBLIC_BASE_URL = 'https://images.gogo.test'

function mediaReadUrl(storageKey: string): string | null {
  if (!MEDIA_PUBLIC_BASE_URL) return null
  return `${MEDIA_PUBLIC_BASE_URL}/${storageKey.replace(/^\//, '')}`
}

function seedDb() {
  return {
    places: places.map((place) => ({ ...place, media: place.media.map((row) => ({ ...row })) })),
    areas: cmsAreas.map((area) => ({ ...area })),
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
    /**
     * Uploads authorized this session.
     *
     * A banner may reference only one of these keys, and attaching a photo to a
     * place goes through the same check GoGo-BE runs in `UploadsService#attach`:
     * the key must be **this actor's**, for **that purpose**, and unclaimed.
     * Keeping the actor and the purpose here is what makes a foreign or
     * wrong-purpose key reachable in a test instead of only in production.
     */
    uploads: [] as MockUpload[],
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
}

let db = seedDb()

/**
 * Put the mock catalogue back to the fixtures.
 *
 * `server.resetHandlers()` restores the *handlers*, never what they wrote, so
 * a suite that attaches, reorders and detaches photos would hand the next test
 * a place it never set up. Opt in from a `beforeEach` where that matters —
 * suites that deliberately build state across cases are left alone.
 */
export function resetMockDb(): void {
  db = seedDb()
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

/**
 * What GoGo-BE's `ZodValidationPipe` returns for a body its schema refuses —
 * status, code, message and per-field paths, byte for byte.
 *
 * Until CMS-043 the place handlers did `Object.assign(place, await
 * request.json())` and accepted anything, so the CMS could drift away from
 * `placeEditSchema` (`avgVisitMinutes` 0..1440 here against 10..720 there)
 * with a green test suite and a broken save button.
 */
function validationEnvelope(issues: readonly z.ZodIssue[]) {
  return HttpResponse.json(
    {
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      field_errors: toFieldErrors(issues),
      request_id: 'mock-validation-failed',
      retryable: false,
    },
    { status: 400 },
  )
}

/**
 * The Vietnamese folding `normalizeVietnamese` does in GoGo-BE, enough of it
 * that "quan 1" matches "Quận 1, TP.HCM".
 */
function foldVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase()
}

type ContactIssue = { field: string; code: string; message: string }
type Normalized = { ok: true; value: string } | { ok: false; issue: ContactIssue }

/**
 * `normalizePhone` from `GoGo-BE/libs/modules/cms/domain/place-contact.ts`.
 *
 * Lives in the mock, not in the app: the console must send what the editor
 * typed and render whatever the server answers. A second normalizer in the
 * browser would accept values the server refuses and refuse values it accepts,
 * and neither client would ever hear about the difference.
 */
function mockNormalizePhone(raw: string): Normalized {
  const trimmed = raw.trim()
  const invalid: ContactIssue = {
    field: 'phone',
    code: 'invalid',
    message: 'Số điện thoại không hợp lệ',
  }
  if (trimmed === '') return { ok: false, issue: invalid }
  const cleaned = trimmed.replace(/[\s().\-–—]/g, '')
  if (!/^\+?\d+$/.test(cleaned)) return { ok: false, issue: invalid }
  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned

  let e164: string
  if (cleaned.startsWith('+')) e164 = digits
  else if (digits.startsWith('00')) e164 = digits.slice(2)
  else if (digits.startsWith('0')) e164 = `84${digits.slice(1)}`
  else if (digits.startsWith('84')) e164 = digits
  else {
    // A bare subscriber number could belong to any country; guessing one would
    // invent a fact about the place.
    return {
      ok: false,
      issue: { field: 'phone', code: 'no_country', message: 'Thiếu mã quốc gia hoặc số 0 đầu' },
    }
  }
  if (e164.length < 8 || e164.length > 15) return { ok: false, issue: invalid }
  return { ok: true, value: `+${e164}` }
}

/** `normalizeWebsite` from the same file: `http(s)` only, bare host upgraded. */
function mockNormalizeWebsite(raw: string): Normalized {
  const trimmed = raw.trim()
  const invalid: ContactIssue = {
    field: 'website',
    code: 'invalid',
    message: 'Website phải là địa chỉ http hoặc https hợp lệ',
  }
  if (trimmed === '') return { ok: false, issue: invalid }
  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return { ok: false, issue: invalid }
  }
  // An allowlist, not a denylist: the value is rendered as an href in three
  // clients, so `javascript:` and `data:` are the whole point.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, issue: invalid }
  if (url.hostname === '' || !url.hostname.includes('.')) return { ok: false, issue: invalid }
  if (url.href.length > 500) {
    return { ok: false, issue: { field: 'website', code: 'too_long', message: 'Website quá dài' } }
  }
  return { ok: true, value: url.href }
}

/** Mirrors `PLACE_TRANSITIONS` in `cms-catalog.service.ts`. */
const MOCK_PLACE_TRANSITIONS: Record<PlaceStatus, PlaceStatus[]> = {
  draft: ['review', 'archived'],
  community_submitted: ['review', 'published', 'archived'],
  review: ['published', 'draft', 'archived'],
  published: ['suspended', 'archived'],
  suspended: ['published', 'archived'],
  archived: [],
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

/**
 * `CmsCatalogController` — `@RequireRole('editor')`, and writes are exact:
 * a moderator reads the catalogue and an ops_admin outranks it, but neither
 * writes to it. Hiding the button in the console is not the check.
 */
function requireEditor(message = 'the catalogue is editor only') {
  const { role } = currentActor()
  if (role === 'editor' || role === 'super_admin') return null
  return envelope(403, 'FORBIDDEN', message)
}

/**
 * The order `cmsGetPlace` returns photos in: the cover first, then `sortOrder`.
 * Cover-first is what a consumer needs; the console re-sorts by `sortOrder`,
 * because that is the field its reorder controls actually write.
 */
function sortedMedia(place: (typeof places)[number]) {
  return [...place.media].sort((left, right) => {
    if (left.isCover !== right.isCover) return left.isCover ? -1 : 1
    return left.sortOrder - right.sortOrder
  })
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

  // CMS #153 — the administrative surface (GoGo-BE ADM-005/ADM-009). The mock
  // answers the shape the vendored contract declares; the screens in #154–#156
  // will need richer fixtures, and they can extend these rather than invent a
  // second set.
  http.get(`${BASE}/cms/administrative-datasets/capability`, () =>
    HttpResponse.json({
      dataset: {
        state: 'AVAILABLE',
        version: 'v5.0.0+v2.4.1+7fac8c45+none+r0',
        publishedAt: '2026-09-07T00:00:00.000Z',
        ageSeconds: 120,
        counts: { STAGED: 0, VALIDATED: 0, REJECTED: 0, PUBLISHED: 1, ROLLED_BACK: 0 },
        quarantined: 1033,
        unresolved: 1033,
        validation: { errors: 0, warnings: 2 },
      },
      boundaries: {
        state: 'AVAILABLE',
        version: 'v5.0.0',
        loadedAt: '2026-09-07T00:00:00.000Z',
        ageSeconds: 300,
        provinces: 34,
        communes: 3321,
      },
      resolver: 'FULL',
      publication: 'ENABLED',
      mappings: {
        UNMAPPED: 4,
        AUTO_MATCHED: 0,
        NEEDS_REVIEW: 2,
        VERIFIED: 1,
        REJECTED: 0,
        STALE: 0,
      },
      remediation: { compliant: 10, unmapped: 0 },
      observedAt: '2026-09-07T00:02:00.000Z',
    }),
  ),
  // CMS #154 — dataset operations. Three versions in the three states the
  // screen has to tell apart: one active, one validated and publishable, one
  // staged whose validation failed.
  http.get(`${BASE}/cms/administrative-datasets/restorable`, () =>
    HttpResponse.json({
      // Previously published, not active now — the server's own definition.
      items: administrativeDatasets.filter(
        (item) => item.status === 'ROLLED_BACK' && item.publishedAt !== null,
      ),
    }),
  ),
  http.get(`${BASE}/cms/administrative-datasets`, ({ request }) => {
    const url = new URL(request.url)
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const ordered = [...administrativeDatasets].sort((a, b) =>
      b.importedAt.localeCompare(a.importedAt),
    )
    return HttpResponse.json({
      items: ordered.slice(offset, offset + limit),
      total: ordered.length,
      limit,
      offset,
    })
  }),
  http.post(`${BASE}/cms/administrative-datasets/import`, () =>
    HttpResponse.json(
      {
        datasetVersionId: administrativeDatasets[1]!.id,
        combinedDatasetVersion: administrativeDatasets[1]!.combinedDatasetVersion,
        combinedChecksum: administrativeDatasets[1]!.combinedChecksum,
        counts: {
          provinces: 34,
          communes: 3321,
          legacyDistricts: 705,
          legacyCommunes: 10598,
          canonicalChanges: 10598,
          quarantined: 1033,
        },
        classification: { unresolved_target: 1033 },
        warnings: [],
      },
      { status: 201 },
    ),
  ),
  http.get(`${BASE}/cms/administrative-datasets/:id`, ({ params }) => {
    const found = administrativeDatasets.find((item) => item.id === params.id)
    if (!found) return envelope(404, 'DATASET_NOT_FOUND', 'no such dataset')
    return HttpResponse.json({
      ...found,
      validationReport: administrativeValidationReport(found),
      diffSummary: null,
    })
  }),
  http.get(`${BASE}/cms/administrative-datasets/:id/diff`, ({ params, request }) => {
    const url = new URL(request.url)
    const limit = Number(url.searchParams.get('limit') ?? 100)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const found = administrativeDatasets.find((item) => item.id === params.id)
    if (!found) return envelope(404, 'DATASET_NOT_FOUND', 'no such dataset')
    return HttpResponse.json({
      ...administrativeDiff,
      toVersion: found.combinedDatasetVersion,
      entries: administrativeDiff.entries.slice(offset, offset + limit),
      pagination: {
        offset,
        limit,
        totalEntries: administrativeDiff.entries.length,
        hasMore: offset + limit < administrativeDiff.entries.length,
      },
    })
  }),
  http.post(`${BASE}/cms/administrative-datasets/:id/validate`, ({ params }) => {
    const found = administrativeDatasets.find((item) => item.id === params.id)
    if (!found) return envelope(404, 'DATASET_NOT_FOUND', 'no such dataset')
    return HttpResponse.json(
      { validation: administrativeValidationReport(found), diff: administrativeDiff },
      { status: 201 },
    )
  }),
  http.post(`${BASE}/cms/administrative-datasets/:id/publish`, ({ params }) => {
    const found = administrativeDatasets.find((item) => item.id === params.id)
    if (!found) return envelope(404, 'DATASET_NOT_FOUND', 'no such dataset')
    return HttpResponse.json(administrativeTransition(found), { status: 201 })
  }),
  http.post(`${BASE}/cms/administrative-datasets/:id/rollback`, ({ params }) => {
    const found = administrativeDatasets.find((item) => item.id === params.id)
    if (!found) return envelope(404, 'DATASET_NOT_FOUND', 'no such dataset')
    return HttpResponse.json(administrativeTransition(found), { status: 201 })
  }),
  // CMS #155 — the source-drift queue. Stateful on purpose: a decision has to
  // move the revision, supersede the previous one and change the counts, and a
  // fixture that answered the same thing every time would let the screen ship
  // claiming an append-only history it never exercised.
  http.get(`${BASE}/cms/administrative-datasets/:id/quarantine`, ({ request }) => {
    const url = new URL(request.url)
    const wanted = url.searchParams.get('decisionState')?.split(',').filter(Boolean) ?? []
    const classes = url.searchParams.get('classification')?.split(',').filter(Boolean) ?? []
    const limit = Number(url.searchParams.get('limit') ?? 25)
    const cursor = url.searchParams.get('cursor')

    let rows = quarantineRows.map(quarantineListItem)
    if (classes.length) rows = rows.filter((r) => classes.includes(r.classification))
    if (wanted.length) rows = rows.filter((r) => wanted.includes(r.decisionState))
    const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0
    const page = rows.slice(start, start + limit)
    return HttpResponse.json({
      items: page,
      nextCursor: start + limit < rows.length ? (page.at(-1)?.id ?? null) : null,
      counts: quarantineCounts(),
    })
  }),
  http.get(`${BASE}/cms/administrative-datasets/:id/quarantine/:rowId`, ({ params }) => {
    const row = quarantineRows.find((r) => r.id === params.rowId)
    if (!row) return envelope(404, 'QUARANTINE_ROW_NOT_FOUND', 'no such row')
    return HttpResponse.json(quarantineDetail(row))
  }),
  http.get(`${BASE}/cms/administrative-datasets/:id/override-set`, () =>
    HttpResponse.json({
      draft: overrideSet.status === 'DRAFT' ? { ...overrideSet } : null,
      counts: quarantineCounts(),
      materialized: materialisedSets,
    }),
  ),
  http.post(
    `${BASE}/cms/administrative-datasets/:id/quarantine/:rowId/accept`,
    async ({ params, request }) => {
      const body = (await request.json()) as {
        targetCode: string
        targetEffectiveFrom: string
        reason: string
        expectedRevision: number
      }
      return decide(String(params.rowId), 'ACCEPT', body)
    },
  ),
  http.post(
    `${BASE}/cms/administrative-datasets/:id/quarantine/:rowId/reject`,
    async ({ params, request }) => {
      const body = (await request.json()) as { reason: string; expectedRevision: number }
      return decide(String(params.rowId), 'REJECT', body)
    },
  ),
  http.post(
    `${BASE}/cms/administrative-datasets/:id/override-set/materialize`,
    async ({ request }) => {
      const body = (await request.json()) as { reason: string; expectedRevision: number }
      if (overrideSet.status !== 'DRAFT') {
        return envelope(409, 'OVERRIDE_SET_NOT_FOUND', 'no draft override set')
      }
      if (body.expectedRevision !== overrideSet.revision) {
        return envelope(409, 'OVERRIDE_SET_REVISION_CONFLICT', 'the override set moved')
      }
      const accepted = [...decisions.values()].filter((d) => d.decision === 'ACCEPT').length
      const rejected = [...decisions.values()].filter((d) => d.decision === 'REJECT').length
      if (accepted + rejected === 0) {
        return envelope(409, 'OVERRIDE_SET_EMPTY', 'no effective decision to materialise')
      }
      overrideSet.status = 'MATERIALIZED'
      materialisedSets.push({
        id: overrideSet.id,
        revision: overrideSet.revision,
        datasetVersionId: DERIVED_DATASET_ID,
        materializedAt: '2026-09-07T12:00:00.000Z',
      })
      return HttpResponse.json(
        {
          overrideSetId: overrideSet.id,
          overrideSetRevision: overrideSet.revision,
          datasetVersionId: DERIVED_DATASET_ID,
          combinedDatasetVersion: 'v5.0.0+v2.4.1+7fac8c45+none+r1',
          combinedChecksum: 'f1e2d3c4b5a6978869504132fedcba9876543210fedcba9876543210fedcba98',
          overrideRevision: 1,
          status: 'STAGED',
          decisions: { effective: accepted + rejected, accepted, rejected, edges: accepted },
        },
        { status: 201 },
      )
    },
  ),
  http.post(`${BASE}/cms/administrative-datasets/:id/override-set/abandon`, async ({ request }) => {
    const body = (await request.json()) as { reason: string; expectedRevision: number }
    if (overrideSet.status !== 'DRAFT') {
      return envelope(409, 'OVERRIDE_SET_NOT_FOUND', 'no draft override set')
    }
    if (body.expectedRevision !== overrideSet.revision) {
      return envelope(409, 'OVERRIDE_SET_REVISION_CONFLICT', 'the override set moved')
    }
    overrideSet.status = 'ABANDONED'
    return HttpResponse.json(
      {
        overrideSetId: overrideSet.id,
        status: 'ABANDONED',
        abandonedAt: '2026-09-07T12:00:00.000Z',
      },
      { status: 201 },
    )
  }),

  // CMS #156 — per-place mapping moderation. Stateful, because the decisions
  // change status, attribution and the approval blocker, and a fixture that
  // answered the same thing every time would let the screen ship claiming
  // transitions it never made.
  http.get(`${BASE}/cms/administrative-mappings`, ({ request }) => {
    const url = new URL(request.url)
    const statuses = url.searchParams.get('status')?.split(',').filter(Boolean) ?? []
    const blockedOnly = url.searchParams.get('blockedApprovalOnly') === 'true'
    let rows = mappingRows.map(mappingListItem)
    if (statuses.length) rows = rows.filter((r) => statuses.includes(r.mappingStatus))
    if (blockedOnly) rows = rows.filter((r) => r.blocksApproval)
    return HttpResponse.json({ items: rows, nextCursor: null, counts: mappingCounts() })
  }),
  // The reviewer's selectors read GoGo-BE's own current dataset. ADR-0019 §9.5
  // forbids fetching administrative data from anywhere else, and the identities
  // a reviewer picks must come from the dataset the decision is validated
  // against.
  http.get(`${BASE}/administrative/provinces`, ({ request }) =>
    unitPage(
      request,
      PROVINCES.map((p) => unitDto(p, 'PROVINCE', null)),
    ),
  ),
  http.get(`${BASE}/administrative/provinces/:provinceCode/communes`, ({ request, params }) =>
    unitPage(
      request,
      (COMMUNES[String(params.provinceCode)] ?? []).map((c) =>
        unitDto(c, 'COMMUNE', String(params.provinceCode)),
      ),
    ),
  ),
  // ADM-105 — the same normalisation the server does, so "ba dinh" finds
  // "Phường Ba Đình" here exactly as it does in DEV.
  http.get(`${BASE}/administrative/search`, ({ request }) => {
    const url = new URL(request.url)
    const query = fold(url.searchParams.get('query') ?? '')
    const provinceCode = url.searchParams.get('provinceCode')
    const rows = [
      ...PROVINCES.map((p) => unitDto(p, 'PROVINCE', null)),
      ...Object.entries(COMMUNES).flatMap(([parent, communes]) =>
        communes.map((c) => unitDto(c, 'COMMUNE', parent)),
      ),
    ].filter((unit) => {
      if (provinceCode && unit.level === 'COMMUNE' && unit.parentCode !== provinceCode) return false
      return fold(unit.fullName).includes(query) || fold(unit.name).includes(query)
    })
    return unitPage(request, rows)
  }),

  http.get(`${BASE}/cms/administrative-mappings/remediation`, () =>
    HttpResponse.json({
      activeDatasetVersion: ACTIVE_DATASET_VERSION,
      counts: {
        compliant: 128,
        unmapped: 4,
        needs_review: 2,
        stale: 1,
        rejected: 0,
        verified_against_older_version: 6,
      },
      samples: {},
    }),
  ),
  http.get(`${BASE}/cms/places/:id/administrative-mapping`, ({ params }) => {
    const row = mappingRows.find((r) => r.placeId === params.id)
    if (!row) return envelope(404, 'PLACE_NOT_FOUND', 'no such place')
    return HttpResponse.json(mappingDetail(row))
  }),
  http.post(`${BASE}/cms/places/:id/administrative-mapping/verify`, async ({ params, request }) => {
    const body = (await request.json()) as {
      provinceCode: string
      communeCode: string
      expectedUpdatedAt: string
    }
    const row = mappingRows.find((r) => r.placeId === params.id)
    if (!row) return envelope(404, 'PLACE_NOT_FOUND', 'no such place')
    if (body.expectedUpdatedAt !== row.updatedAt) {
      return envelope(409, 'PLACE_MODIFIED', 'the place changed since it was read')
    }
    const commune = COMMUNES[body.provinceCode]?.find((c) => c.code === body.communeCode)
    if (!commune) return envelope(400, 'HIERARCHY_INVALID', 'commune is not in that province')
    row.status = 'VERIFIED'
    row.provinceCode = body.provinceCode
    row.communeCode = body.communeCode
    // A manual verification writes no confidence: judgement is not a probability.
    row.confidence = null
    row.method = 'editor'
    row.reviewer = { id: 'ad-2', displayName: 'moderator' }
    row.updatedAt = new Date(Date.parse(row.updatedAt) + 1000).toISOString()
    return HttpResponse.json(
      { placeId: row.placeId, status: 'VERIFIED', datasetVersion: ACTIVE_DATASET_VERSION },
      { status: 201 },
    )
  }),
  http.post(
    `${BASE}/cms/places/:id/administrative-mapping/correct`,
    async ({ params, request }) => {
      const body = (await request.json()) as {
        provinceCode: string
        communeCode: string
        reason: string
        expectedUpdatedAt: string
      }
      const row = mappingRows.find((r) => r.placeId === params.id)
      if (!row) return envelope(404, 'PLACE_NOT_FOUND', 'no such place')
      if (body.expectedUpdatedAt !== row.updatedAt) {
        return envelope(409, 'PLACE_MODIFIED', 'the place changed since it was read')
      }
      row.status = 'VERIFIED'
      row.provinceCode = body.provinceCode
      row.communeCode = body.communeCode
      row.confidence = null
      row.reviewer = { id: 'ad-2', displayName: 'moderator' }
      row.updatedAt = new Date(Date.parse(row.updatedAt) + 1000).toISOString()
      return HttpResponse.json({ placeId: row.placeId, status: 'VERIFIED' }, { status: 201 })
    },
  ),
  http.post(`${BASE}/cms/places/:id/administrative-mapping/reject`, async ({ params, request }) => {
    const body = (await request.json()) as { reason: string; expectedUpdatedAt: string }
    const row = mappingRows.find((r) => r.placeId === params.id)
    if (!row) return envelope(404, 'PLACE_NOT_FOUND', 'no such place')
    if (body.expectedUpdatedAt !== row.updatedAt) {
      return envelope(409, 'PLACE_MODIFIED', 'the place changed since it was read')
    }
    row.status = 'REJECTED'
    row.updatedAt = new Date(Date.parse(row.updatedAt) + 1000).toISOString()
    return HttpResponse.json({ placeId: row.placeId, status: 'REJECTED' }, { status: 201 })
  }),
  http.post(
    `${BASE}/cms/places/:id/administrative-mapping/rematch`,
    async ({ params, request }) => {
      const body = (await request.json()) as { reason: string; expectedUpdatedAt: string }
      const row = mappingRows.find((r) => r.placeId === params.id)
      if (!row) return envelope(404, 'PLACE_NOT_FOUND', 'no such place')
      if (row.status === 'VERIFIED') {
        return envelope(409, 'VERIFIED_NOT_REMATCHABLE', 'a verified mapping is not rematchable')
      }
      if (body.expectedUpdatedAt !== row.updatedAt) {
        return envelope(409, 'PLACE_MODIFIED', 'the place changed since it was read')
      }
      row.status = 'NEEDS_REVIEW'
      // Asking for a rematch is not verifying anything: the previous reviewer's
      // attribution goes with the decision it belonged to.
      row.reviewer = null
      row.method = 'change_mapping'
      row.updatedAt = new Date(Date.parse(row.updatedAt) + 1000).toISOString()
      return HttpResponse.json(
        { placeId: row.placeId, status: 'NEEDS_REVIEW', communeCode: row.communeCode },
        { status: 201 },
      )
    },
  ),
  http.post(`${BASE}/cms/places/:id/administrative-mapping/reconcile`, ({ params }) => {
    const row = mappingRows.find((r) => r.placeId === params.id)
    if (!row) return envelope(404, 'PLACE_NOT_FOUND', 'no such place')
    const verdict = staleVerdict(row)
    // Reconciling writes only when the mapping has actually stopped holding.
    const changed = verdict.stale && row.status !== 'STALE'
    if (changed) {
      row.status = 'STALE'
      row.updatedAt = new Date(Date.parse(row.updatedAt) + 1000).toISOString()
    }
    return HttpResponse.json(
      { placeId: row.placeId, changed, verdict: staleVerdict(row) },
      { status: 201 },
    )
  }),

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
    // ADR-0018: an environment has exactly one super admin. Granting the role is
    // refused outright, and so is giving it up — not counted, because there can
    // never be a second holder to count.
    if (body.role === 'super_admin') {
      return envelope(409, 'SUPER_ADMIN_SINGLETON', 'a second super_admin cannot be created')
    }
    if (body.role && row.role === 'super_admin') {
      return envelope(409, 'LAST_SUPER_ADMIN', 'the super_admin role cannot be given up')
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
    // Suspending it is demotion by another name (ADR-0018).
    if (row.role === 'super_admin') {
      return envelope(409, 'LAST_SUPER_ADMIN', 'the super_admin cannot be suspended')
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
    // ADR-0018 — the bootstrapped account is not created here. The server's
    // request enum still lists the value (narrowing it is a breaking change),
    // so this refusal is what a client sending it actually meets.
    if (body.role === 'super_admin') {
      return envelope(409, 'SUPER_ADMIN_SINGLETON', 'a second super_admin cannot be created')
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

  /**
   * `cmsResolvePlaceLink` (GoGo-BE#465). Answers off the link's own shape so
   * the console's four states are all reachable without a provider: a link
   * carrying a Place ID resolves, one naming a chain is ambiguous, one whose id
   * a fixture place already holds already exists, and anything else is
   * unresolved. Declared before `/cms/places/:id` — MSW matches in order, and
   * `:id` would otherwise swallow `resolve-link`.
   */
  http.post(`${BASE}/cms/places/resolve-link`, async ({ request }) => {
    const body = (await request.json()) as { url?: string; googlePlaceId?: string }
    const url = body.url ?? ''
    // #469 — a chosen branch resolves the same way a link naming it would, so
    // the mock answers the same shape from whichever the client sent.
    const placeId =
      body.googlePlaceId ?? /[?&](?:place_id|placeid|query_place_id)=([\w-]+)/.exec(url)?.[1]

    if (placeId === 'ChIJalreadyhere') {
      return HttpResponse.json(
        {
          status: 'ALREADY_EXISTS',
          existingPlaceId: db.places[0]!.id,
          reasonCodes: ['PLACE_ALREADY_LINKED', 'DB_FIRST'],
        },
        { status: 201 },
      )
    }
    if (placeId) {
      return HttpResponse.json(
        {
          status: 'RESOLVED',
          matchConfidence: 0.97,
          reasonCodes: ['EXACT_PROVIDER_ID'],
          candidate: {
            googlePlaceId: placeId,
            name: BRANCH_NAMES[placeId] ?? 'Cà Phê Bên Đường',
            address: '9 Nguyễn Huệ, Quận 1, Hồ Chí Minh',
            // The doubles cms-dev answered for Landmark 81. Google publishes
            // 10.7951153 / 106.7221002; JSON hands back the nearest double,
            // which is a different one, and the console rounds it back (#157).
            location: { lat: 10.795115299999999, lng: 106.72210020000001 },
            googleRating: 4.4,
            googleRatingCount: 88,
            googleScore: 71,
            businessStatus: 'OPERATIONAL',
            source: 'google_places',
            fetchedAt: new Date().toISOString(),
            attributions: ['Dữ liệu bản đồ ©2026 Google'],
          },
        },
        { status: 201 },
      )
    }
    if (/\/maps\/place\//.test(url)) {
      return HttpResponse.json(
        {
          status: 'CANDIDATE_SELECTION',
          reasonCodes: ['AMBIGUOUS_NAME'],
          candidates: [
            {
              googlePlaceId: 'ChIJa',
              name: 'Highlands Coffee',
              address: '1 Lê Lợi',
              confidence: 0.62,
            },
            {
              googlePlaceId: 'ChIJb',
              name: 'Highlands Coffee',
              address: '88 Hai Bà Trưng',
              confidence: 0.6,
            },
          ],
        },
        { status: 201 },
      )
    }
    return HttpResponse.json({ status: 'UNRESOLVED', reasonCodes: ['NOT_FOUND'] }, { status: 201 })
  }),

  /**
   * `cmsCreatePlace` (GoGo-BE#452/#465). The row lands in `db.places` so the
   * editor the console navigates to afterwards actually loads.
   */
  http.post(`${BASE}/cms/places`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const created = {
      ...db.places[0]!,
      id: `created-${db.places.length + 1}`,
      name: String(body.name ?? ''),
      status: 'draft',
      lat: Number(body.lat ?? 0),
      lng: Number(body.lng ?? 0),
      addressText: (body.addressText as string | undefined) ?? null,
      media: [],
      /*
       * ADM-016 — the server resolves the mapping inside the create
       * transaction, so the record it answers with already carries one. It is
       * AUTO_MATCHED and blocked, because nothing about creating a place
       * verifies its mapping.
       */
      administrative: {
        status: 'AUTO_MATCHED' as const,
        provinceCode: (body.provinceCode as string | undefined) ?? null,
        provinceName: (body.provinceCode as string | undefined) ? 'Thành phố Hà Nội' : null,
        communeCode: (body.communeCode as string | undefined) ?? null,
        communeName: (body.communeCode as string | undefined) ? 'Phường Ba Đình' : null,
        method: body.provinceCode ? 'trusted_code' : 'boundary_point_in_polygon',
        datasetVersion: ACTIVE_DATASET_VERSION,
        activeDatasetVersion: ACTIVE_DATASET_VERSION,
        mappedAt: new Date().toISOString(),
        approvalBlock: {
          code: 'MAPPING_NOT_VERIFIED',
          message: 'the administrative mapping is AUTO_MATCHED: a resolver result, not an approval',
        },
      },
      updatedAt: new Date().toISOString(),
    }
    db.places.push(created as (typeof db.places)[number])
    return HttpResponse.json(created, { status: 201 })
  }),

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

    let items = [...db.audit, ...auditEntries, ...administrativeAuditEntries]
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
    // Cover first, then sort order — the read order `cmsGetPlace` promises.
    return HttpResponse.json({ ...place, media: sortedMedia(place) })
  }),

  /**
   * `cmsListAreas` (GoGo-BE#425). Filtering happens the way the service does
   * it — Vietnamese-normalized over name *and* key, so "quan 1" finds
   * "Quận 1, TP.HCM" — because a mock that only does `includes()` would let
   * the console ship a search box that answers nothing in production.
   */
  http.get(`${BASE}/cms/areas`, ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')
    const city = url.searchParams.get('city')
    const includeInactive = url.searchParams.get('includeInactive') === 'true'

    let items = db.areas
    // A retired area is not offered as a new choice; it is still returned when
    // the console is resolving a value a place already holds.
    if (!includeInactive) items = items.filter((area) => area.isActive)
    if (city) items = items.filter((area) => area.city === city)
    if (q?.trim()) {
      const needle = foldVietnamese(q)
      items = items.filter((area) =>
        foldVietnamese(`${area.name ?? ''} ${area.key}`).includes(needle),
      )
    }
    return HttpResponse.json({ items })
  }),

  http.patch(`${BASE}/cms/places/:id`, async ({ params, request }) => {
    const place = db.places.find((item) => item.id === params.id)
    if (!place) return envelope(404, 'NOT_FOUND', 'place not found')
    const parsed = cmsPlaceEditMockSchema.safeParse(await request.json())
    if (!parsed.success) return validationEnvelope(parsed.error.issues)
    const { expectedUpdatedAt, ...input } = parsed.data

    // Optimistic concurrency, byte for byte: the code, and the *current*
    // `updatedAt` in the first field error, are what the console diffs against.
    if (
      expectedUpdatedAt &&
      new Date(expectedUpdatedAt).getTime() !== Date.parse(place.updatedAt)
    ) {
      return HttpResponse.json(
        {
          code: 'PLACE_MODIFIED',
          message: 'This place changed after the form was loaded',
          field_errors: [{ field: 'updatedAt', code: 'stale', message: place.updatedAt }],
          request_id: 'mock-place-modified',
          retryable: false,
        },
        { status: 409 },
      )
    }

    /*
     * The server is the only normalizer (GoGo-BE `place-contact.ts`), so the
     * mock has to be one too. A mock that stored `0283 822 9999` verbatim would
     * let the console ship a phone field whose saved value never matches what
     * comes back on the next read — and would never exercise the field errors
     * the editor has to render.
     */
    const fieldErrors: { field: string; code: string; message: string }[] = []
    if (typeof input.phone === 'string') {
      const result = mockNormalizePhone(input.phone)
      if (result.ok) input.phone = result.value
      else fieldErrors.push(result.issue)
    }
    if (typeof input.website === 'string') {
      const result = mockNormalizeWebsite(input.website)
      if (result.ok) input.website = result.value
      else fieldErrors.push(result.issue)
    }
    if (fieldErrors.length > 0) {
      return HttpResponse.json(
        {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          field_errors: fieldErrors,
          request_id: 'mock-validation-failed',
          retryable: false,
        },
        { status: 400 },
      )
    }

    /*
     * ADM-016 — the codes are not columns on the record the console reads back.
     * The server resolves them inside the same transaction and answers with the
     * *stored* mapping, so the mock does the same: a mock that echoed
     * `provinceCode` at the top level would let the console ship a form that
     * reads its own submission back and never notices the server disagreed.
     */
    const { provinceCode, communeCode, ...rest } = input
    Object.assign(place, rest)
    if (provinceCode !== undefined || communeCode !== undefined) {
      const nextProvince =
        provinceCode === undefined ? place.administrative?.provinceCode : provinceCode
      const nextCommune =
        communeCode === undefined ? place.administrative?.communeCode : communeCode
      place.administrative = {
        ...(place.administrative ?? {
          status: 'AUTO_MATCHED' as const,
          method: 'trusted_code',
          datasetVersion: ACTIVE_DATASET_VERSION,
          activeDatasetVersion: ACTIVE_DATASET_VERSION,
          mappedAt: new Date().toISOString(),
          approvalBlock: {
            code: 'MAPPING_NOT_VERIFIED',
            message: 'a resolver result, not an approval',
          },
        }),
        provinceCode: nextProvince ?? null,
        provinceName: nextProvince ? unitNameFor(nextProvince) : null,
        communeCode: nextCommune ?? null,
        communeName: nextCommune ? unitNameFor(nextCommune) : null,
      }
    }
    place.updatedAt = new Date().toISOString()
    return HttpResponse.json(place)
  }),

  http.patch(`${BASE}/cms/places/:id/status`, async ({ params, request }) => {
    const place = db.places.find((item) => item.id === params.id)
    if (!place) return envelope(404, 'NOT_FOUND', 'place not found')
    const body = (await request.json()) as { status: PlaceStatus }
    // The state machine is server-side (`cms-catalog.service.ts`); a UI that
    // offers an illegal target must fail here, not quietly succeed.
    if (!MOCK_PLACE_TRANSITIONS[place.status].includes(body.status)) {
      return envelope(
        409,
        'INVALID_PLACE_TRANSITION',
        `${place.status} → ${body.status} is not allowed`,
      )
    }
    place.status = body.status
    place.updatedAt = new Date().toISOString()
    return HttpResponse.json(place)
  }),

  http.put(`${BASE}/cms/places/:id/hours`, async ({ params, request }) => {
    const place = db.places.find((item) => item.id === params.id)
    if (!place) return envelope(404, 'NOT_FOUND', 'place not found')
    const parsed = cmsPlaceHoursSchema.safeParse(await request.json())
    if (!parsed.success) return validationEnvelope(parsed.error.issues)

    // GoGo-BE#425 — the rules `validateWeek` enforces beyond the shape. Mocked
    // here so a week the server would refuse is refused in tests too, rather
    // than passing locally and failing as a toast in dev.
    const semantic = mockHoursIssues(parsed.data.hours)
    if (semantic.length > 0) {
      return HttpResponse.json(
        {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          field_errors: semantic,
          request_id: `req-${Math.random().toString(36).slice(2, 10)}`,
          retryable: false,
        },
        { status: 400 },
      )
    }

    const verifiedAt = new Date().toISOString()
    /*
     * Provenance is the server's to stamp, and it does not stamp every row.
     * A row declared `provider` keeps that source and the `verifiedAt` of the
     * row it replaces; only an `editor` row is verified now, and only an
     * editor row moves the place's freshness clock (GoGo-BE#425).
     */
    const before = place.hours
    place.hours = parsed.data.hours.map((hour) => {
      const source = hour.source ?? 'editor'
      if (source === 'editor') return { ...hour, source, verifiedAt }
      const carried = before.find(
        (row) =>
          row.dayOfWeek === hour.dayOfWeek &&
          (row.kind ?? 'interval') === hour.kind &&
          row.openMinute === hour.openMinute &&
          row.closeMinute === hour.closeMinute,
      )
      return { ...hour, source, verifiedAt: carried?.verifiedAt ?? null }
    })
    if (parsed.data.hours.some((hour) => (hour.source ?? 'editor') === 'editor')) {
      place.freshnessCheckedAt = verifiedAt
    }
    place.updatedAt = verifiedAt
    return HttpResponse.json(place)
  }),

  /*
   * Place media (GoGo-BE#191), mirroring `CmsPlaceMediaService`.
   *
   * `/attachable` is declared before `:mediaId` for the same reason Nest needs
   * it first: both are four segments, and the router matches in order.
   */
  http.get(`${BASE}/cms/places/:placeId/media/attachable`, ({ params }) => {
    const place = db.places.find((item) => item.id === params.placeId)
    if (!place) return envelope(404, 'PLACE_NOT_FOUND', 'place not found')
    const owner = currentActor().displayName
    // Never a consumer purpose, and never somebody else's key: a member's
    // check-in photo does not become catalog art because an editor can see a
    // list.
    const items = db.uploads
      .filter((upload) => upload.purpose === 'place_image' && upload.owner === owner)
      .filter(
        (upload) =>
          upload.status === 'pending' || place.media.some((row) => row.storageKey === upload.key),
      )
      .map((upload) => ({
        id: upload.id,
        storageKey: upload.key,
        contentType: upload.contentType,
        contentLength: upload.contentLength,
        status: upload.status,
        attachedHere: place.media.some((row) => row.storageKey === upload.key),
        url: mediaReadUrl(upload.key),
        createdAt: upload.createdAt,
      }))
    return HttpResponse.json({ items })
  }),

  http.post(`${BASE}/cms/places/:placeId/media`, async ({ params, request }) => {
    const denied = requireEditor('place media is editor only')
    if (denied) return denied
    const place = db.places.find((item) => item.id === params.placeId)
    if (!place) return envelope(404, 'PLACE_NOT_FOUND', 'place not found')

    const parsed = cmsPlaceMediaAttachSchema.safeParse(await request.json())
    if (!parsed.success) return validationEnvelope(parsed.error.issues)
    const input = parsed.data

    if (place.media.some((row) => row.storageKey === input.storageKey)) {
      return envelope(409, 'PLACE_MEDIA_EXISTS', 'That image is already on this place')
    }

    /*
     * `UploadsService#attach`, in one condition. Unknown, expired, foreign,
     * wrong-purpose and already-claimed are refused **identically**, so a
     * caller learns only that their own key is unusable — never whether
     * somebody else's exists.
     */
    const upload = db.uploads.find(
      (candidate) =>
        candidate.key === input.storageKey &&
        candidate.purpose === 'place_image' &&
        candidate.owner === currentActor().displayName &&
        candidate.status === 'pending',
    )
    if (!upload) return envelope(400, 'INVALID_UPLOAD_KEY', 'upload key is not usable')
    upload.status = 'attached'

    const nextSort = place.media.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1
    if (input.isCover === true) {
      for (const row of place.media) row.isCover = false
    }
    const created = {
      id: `pm-${place.id}-${place.media.length + 100}`,
      storageKey: input.storageKey,
      url: mediaReadUrl(input.storageKey),
      width: input.width ?? null,
      height: input.height ?? null,
      sortOrder: nextSort,
      // Pending, always: the person who uploads is not automatically the
      // person who decides the photo may be published.
      moderation: 'pending',
      moderationReason: null,
      caption: input.caption ?? null,
      attribution: input.attribution ?? null,
      isCover: input.isCover ?? false,
      sourceType: 'editorial',
      createdAt: new Date().toISOString(),
    }
    place.media = [...place.media, created]
    place.updatedAt = created.createdAt
    return HttpResponse.json(created, { status: 201 })
  }),

  http.patch(`${BASE}/cms/places/:placeId/media/:mediaId`, async ({ params, request }) => {
    const denied = requireEditor('place media is editor only')
    if (denied) return denied
    const place = db.places.find((item) => item.id === params.placeId)
    if (!place) return envelope(404, 'PLACE_NOT_FOUND', 'place not found')
    const row = place.media.find((item) => item.id === params.mediaId)
    // Scoped by place as well as id: a media id from another place is a
    // not-found here, never a 403.
    if (!row) return envelope(404, 'PLACE_MEDIA_NOT_FOUND', 'media not found on this place')

    const parsed = cmsPlaceMediaPatchSchema.safeParse(await request.json())
    if (!parsed.success) return validationEnvelope(parsed.error.issues)
    const patch = parsed.data

    // A rejection with no recorded reason is not auditable, and the next
    // editor cannot tell "blurry" from "somebody's face".
    if (moderationReasonMissing(row.moderation, patch)) {
      return HttpResponse.json(
        {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          field_errors: [
            {
              field: 'moderationReason',
              code: 'required',
              message: 'Quyết định kiểm duyệt phải có lý do',
            },
          ],
          request_id: 'mock-validation-failed',
          retryable: false,
        },
        { status: 400 },
      )
    }

    // Consumers filter on `approved`, so a rejected cover would leave the
    // place with no lead image and nothing on screen saying why.
    const isCover = patch.moderation === 'rejected' ? false : patch.isCover
    if (isCover === true) {
      for (const other of place.media) if (other.id !== row.id) other.isCover = false
    }
    if (patch.sortOrder !== undefined) row.sortOrder = patch.sortOrder
    if (patch.caption !== undefined) row.caption = patch.caption ?? null
    if (patch.attribution !== undefined) row.attribution = patch.attribution ?? null
    if (isCover !== undefined) row.isCover = isCover
    if (patch.moderation !== undefined) {
      row.moderation = patch.moderation
      row.moderationReason = patch.moderationReason ?? null
    }
    place.updatedAt = new Date().toISOString()
    return HttpResponse.json(row)
  }),

  http.delete(`${BASE}/cms/places/:placeId/media/:mediaId`, ({ params }) => {
    const denied = requireEditor('place media is editor only')
    if (denied) return denied
    const place = db.places.find((item) => item.id === params.placeId)
    if (!place) return envelope(404, 'PLACE_NOT_FOUND', 'place not found')
    const row = place.media.find((item) => item.id === params.mediaId)
    if (!row) return envelope(404, 'PLACE_MEDIA_NOT_FOUND', 'media not found on this place')

    place.media = place.media.filter((item) => item.id !== row.id)
    // Detach is not delete: the object stays, and the upload only returns to
    // `pending` once nothing references the key any more.
    const stillReferenced = db.places.some((other) =>
      other.media.some((item) => item.storageKey === row.storageKey),
    )
    if (!stillReferenced) {
      const upload = db.uploads.find((candidate) => candidate.key === row.storageKey)
      if (upload) upload.status = 'pending'
    }
    place.updatedAt = new Date().toISOString()
    return HttpResponse.json({ detached: true })
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
    db.uploads.push({
      id,
      key,
      purpose: String(body.purpose ?? ''),
      contentType: body.contentType,
      contentLength: Number(body.contentLength ?? 0),
      status: 'pending',
      owner: currentActor().displayName,
      createdAt: new Date().toISOString(),
    })
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
    if (!imageKey || !db.uploads.some((upload) => upload.key === imageKey)) {
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

/** CMS #154 — dataset fixtures. Exported so a test can build a variant rather than a second set. */
export const administrativeDatasets = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    combinedDatasetVersion: 'v5.0.0+v2.4.1+7fac8c45+none+r0',
    combinedChecksum: 'b3d1f0a90c5e4a1d8f6c2b7e9a0d3c5f1e2b4a6c8d0f2a4c6e8b0d2f4a6c8e0b',
    status: 'PUBLISHED' as const,
    effectiveDate: '2025-07-01',
    overrideRevision: 0,
    sources: {
      currentSourceVersion: 'v5.0.0',
      historicalSourceVersion: 'v2.4.1',
      mappingSourceCommit: '7fac8c4512ab34cd56ef78ab90cd12ef34ab56cd',
      boundarySourceVersion: 'v5.0.0',
    },
    importedAt: '2026-09-01T02:00:00.000Z',
    publishedAt: '2026-09-01T03:00:00.000Z',
    validation: {
      validationId: 'val-published',
      validatorVersion: 'adm-004.1',
      ranAt: '2026-09-01T02:30:00.000Z',
      errors: 0,
      warnings: 2,
      publishable: true,
      warningGates: ['commune_code_reuse', 'quarantined_change_rows'],
    },
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    combinedDatasetVersion: 'v5.1.0+v2.4.1+7fac8c45+none+r0',
    combinedChecksum: 'c4e2a1b0d6f5b2e9a0d7c3b8f1e4d6a2c5b8e0f3a6d9c2b5e8f1a4d7c0b3e6f9',
    status: 'VALIDATED' as const,
    effectiveDate: '2026-01-01',
    overrideRevision: 0,
    sources: {
      currentSourceVersion: 'v5.1.0',
      historicalSourceVersion: 'v2.4.1',
      mappingSourceCommit: '7fac8c4512ab34cd56ef78ab90cd12ef34ab56cd',
      boundarySourceVersion: 'v5.0.0',
    },
    importedAt: '2026-09-06T02:00:00.000Z',
    publishedAt: null,
    validation: {
      validationId: 'val-staged',
      validatorVersion: 'adm-004.1',
      ranAt: '2026-09-06T02:30:00.000Z',
      errors: 0,
      warnings: 1,
      publishable: true,
      warningGates: ['commune_code_reuse'],
    },
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    combinedDatasetVersion: 'v5.2.0+v2.4.1+7fac8c45+none+r0',
    combinedChecksum: 'e6a4c3d2f8b7d4a1c2f9e5d0b3a6f8c4e7d0a3f6b9c2e5a8d1f4b7e0a3c6d9f2',
    status: 'STAGED' as const,
    effectiveDate: '2026-07-01',
    overrideRevision: 0,
    sources: {
      currentSourceVersion: 'v5.2.0',
      historicalSourceVersion: 'v2.4.1',
      mappingSourceCommit: '7fac8c4512ab34cd56ef78ab90cd12ef34ab56cd',
      boundarySourceVersion: 'v5.0.0',
    },
    importedAt: '2026-09-07T02:00:00.000Z',
    publishedAt: null,
    validation: {
      validationId: 'val-failed',
      validatorVersion: 'adm-004.1',
      ranAt: '2026-09-07T02:30:00.000Z',
      errors: 2,
      warnings: 1,
      publishable: false,
      warningGates: ['commune_code_reuse'],
    },
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    combinedDatasetVersion: 'v4.9.0+v2.4.0+7fac8c45+none+r0',
    combinedChecksum: 'd5f3b2c1e7a6c3f0b1e8d4c9a2f5e7b3d6c9f1a4b7e0d3c6f9a2b5e8d1c4f7a0',
    status: 'ROLLED_BACK' as const,
    effectiveDate: '2025-01-01',
    overrideRevision: 0,
    sources: {
      currentSourceVersion: 'v4.9.0',
      historicalSourceVersion: 'v2.4.0',
      mappingSourceCommit: '7fac8c4512ab34cd56ef78ab90cd12ef34ab56cd',
      boundarySourceVersion: 'v4.9.0',
    },
    importedAt: '2026-08-01T02:00:00.000Z',
    publishedAt: '2026-08-01T03:00:00.000Z',
    validation: {
      validationId: 'val-old',
      validatorVersion: 'adm-004.1',
      ranAt: '2026-08-01T02:30:00.000Z',
      errors: 0,
      warnings: 0,
      publishable: true,
      warningGates: [],
    },
  },
]

type AdministrativeDatasetFixture = (typeof administrativeDatasets)[number]

export function administrativeValidationReport(dataset: AdministrativeDatasetFixture) {
  return {
    datasetVersion: dataset.combinedDatasetVersion,
    ranAt: dataset.validation.ranAt,
    findings: [
      ...(dataset.validation.errors > 0
        ? [
            {
              gate: 'orphan_commune',
              severity: 'ERROR' as const,
              message: '2 communes reference a province that does not exist',
              count: 2,
              samples: ['00099', '00098'],
            },
          ]
        : []),
      {
        gate: 'commune_code_reuse',
        severity: 'WARNING' as const,
        message: '2212 commune codes changed meaning on 2025-07-01',
        count: 2212,
        samples: ['00001', '00004', '00007'],
      },
    ],
    errors: dataset.validation.errors,
    warnings: dataset.validation.warnings,
    publishable: dataset.validation.publishable,
    counts: {
      currentProvinces: 34,
      currentCommunes: 3321,
      historicalProvinces: 63,
      historicalDistricts: 705,
      historicalCommunes: 10598,
      canonicalChanges: 10598,
      quarantined: 1033,
    },
    validationId: dataset.validation.validationId,
    validatorVersion: dataset.validation.validatorVersion,
    boundTo: {
      datasetVersionId: dataset.id,
      combinedDatasetVersion: dataset.combinedDatasetVersion,
      combinedChecksum: dataset.combinedChecksum,
      snapshotFingerprint: 'fp-'.concat(dataset.id.slice(0, 8)),
      overrideRevision: dataset.overrideRevision,
    },
  }
}

export const administrativeDiff = {
  fromVersion: 'v5.0.0+v2.4.1+7fac8c45+none+r0',
  toVersion: 'v5.1.0+v2.4.1+7fac8c45+none+r0',
  countsByCategory: { RENAMED: 2, SOURCE_DRIFT: 1 },
  entries: [
    {
      key: 'commune:00001',
      category: 'RENAMED',
      from: { code: '00001', effectiveFrom: '2025-07-01' },
      to: { code: '00001', effectiveFrom: '2026-01-01' },
      detail: 'Phường Ba Đình → Phường Ba Đình 1',
      provenance: 'current-units v5.1.0',
      validation: [],
    },
    {
      key: 'commune:00004',
      category: 'RENAMED',
      from: { code: '00004', effectiveFrom: '2025-07-01' },
      to: { code: '00004', effectiveFrom: '2026-01-01' },
      detail: 'Phường Cống Vị → Phường Cống Vị 2',
      provenance: 'current-units v5.1.0',
      validation: [],
    },
    {
      key: 'source:current-units',
      category: 'SOURCE_DRIFT',
      from: { code: 'v5.0.0', effectiveFrom: null },
      to: { code: 'v5.1.0', effectiveFrom: null },
      detail: 'current-units v5.0.0 → v5.1.0',
      provenance: null,
      validation: [],
    },
  ],
  entriesTruncated: false,
  entryLimit: 100,
  affectedPlaces: {
    total: 12,
    samples: [
      {
        placeId: 'aaaaaaaa-1111-4111-8111-111111111111',
        name: 'Quán Cơm Ba Đình',
        code: '00001',
        status: 'published',
      },
    ],
    truncated: true,
    sampleLimit: 1,
  },
  pagination: { offset: 0, limit: 100, totalEntries: 3, hasMore: false },
}

export function administrativeTransition(dataset: AdministrativeDatasetFixture) {
  return {
    datasetVersionId: dataset.id,
    combinedDatasetVersion: dataset.combinedDatasetVersion,
    previousActiveVersion: administrativeDatasets[0]!.combinedDatasetVersion,
    previousActiveVersionId: administrativeDatasets[0]!.id,
    publishedAt: '2026-09-07T12:00:00.000Z',
    validationId: dataset.validation.validationId,
    warnings: dataset.validation.warnings,
    warningGates: dataset.validation.warningGates,
    diff: administrativeDiff,
    staleMappings: { total: 0, samples: [], truncated: false, sampleLimit: 20 },
    cacheWarmed: true,
  }
}

/**
 * CMS #154 — the audit trail a dataset version carries. A refused publication
 * is exactly the event a reviewer goes looking for later, so the mock includes
 * one.
 */
export const administrativeAuditEntries: AuditEntry[] = [
  {
    id: 'au-adm-1',
    action: 'administrative_dataset.import',
    actorType: 'admin' as const,
    actorId: 'ad-1',
    actorRole: 'ops_admin' as const,
    resourceType: 'administrative_dataset',
    resourceId: '22222222-2222-4222-8222-222222222222',
    occurredAt: '2026-09-06T02:00:00.000Z',
    diff: { after: { combinedDatasetVersion: 'v5.1.0+v2.4.1+7fac8c45+none+r0', status: 'STAGED' } },
    breakGlass: false,
    requestId: 'req-adm-import',
    authorizationPath: 'exact_role' as const,
  },
  /*
   * GoGo-BE declares an `administrative_dataset.validate` action and has never
   * written it: a validation that runs leaves its evidence in the stored report
   * on the dataset row, not in the audit log. A fixture for it was invented
   * here in #154 and is removed rather than corrected — a mock that answers
   * with rows the API cannot produce teaches the screen to expect them.
   *
   * A *refused* validation is audited, since GoGo-BE#482, exactly as a refused
   * publication already was.
   */
  {
    id: 'au-adm-2',
    action: 'administrative_dataset.validate_rejected',
    actorType: 'admin' as const,
    actorId: 'ad-1',
    actorRole: 'ops_admin' as const,
    resourceType: 'administrative_dataset',
    resourceId: '22222222-2222-4222-8222-222222222222',
    occurredAt: '2026-09-06T02:30:00.000Z',
    diff: { result: 'rejected', reason: 'DATASET_CHANGED_DURING_VALIDATION' },
    breakGlass: false,
    requestId: 'req-adm-validate-refused',
    authorizationPath: 'exact_role' as const,
  },
  {
    id: 'au-adm-3',
    action: 'administrative_dataset.publish_rejected',
    actorType: 'admin' as const,
    actorId: 'ad-1',
    actorRole: 'ops_admin' as const,
    resourceType: 'administrative_dataset',
    resourceId: '22222222-2222-4222-8222-222222222222',
    occurredAt: '2026-09-06T02:35:00.000Z',
    diff: { result: 'rejected', reason: 'VALIDATION_STALE' },
    breakGlass: false,
    requestId: 'req-adm-refused',
    authorizationPath: 'exact_role' as const,
  },
]

/** CMS #155 — the source-drift fixtures, and the draft they accumulate into. */
export const DERIVED_DATASET_ID = '55555555-5555-4555-8555-555555555555'

type QuarantineFixture = {
  id: string
  classification: string
  validationReason: string
  oldCode: string
  oldName: string
  newCode: string
  newName: string
  candidates: { code: string; name: string; selectable: boolean; hierarchyValid: boolean }[]
  affectedPlaceCount: number
}

export const quarantineRows: QuarantineFixture[] = [
  {
    id: 'q1111111-1111-4111-8111-111111111111',
    classification: 'DIVIDED_REQUIRES_REVIEW',
    validationReason: 'the source names several successors and offers a default',
    oldCode: '00160',
    oldName: 'Phường Cống Vị',
    newCode: '00163',
    newName: 'Phường Ba Đình',
    candidates: [
      { code: '00163', name: 'Phường Ba Đình', selectable: true, hierarchyValid: true },
      { code: '00166', name: 'Phường Ngọc Hà', selectable: true, hierarchyValid: true },
      // A district-level unit: shown so a reviewer can see why it is refused.
      { code: '00170', name: 'Quận Ba Đình (cũ)', selectable: false, hierarchyValid: false },
    ],
    affectedPlaceCount: 12,
  },
  {
    id: 'q2222222-2222-4222-8222-222222222222',
    classification: 'DIVIDED_REQUIRES_REVIEW',
    validationReason: 'the source names several successors and offers a default',
    oldCode: '00161',
    oldName: 'Phường Điện Biên',
    newCode: '00163',
    newName: 'Phường Ba Đình',
    candidates: [
      { code: '00163', name: 'Phường Ba Đình', selectable: true, hierarchyValid: true },
      { code: '00169', name: 'Phường Kim Mã', selectable: true, hierarchyValid: true },
    ],
    affectedPlaceCount: 3,
  },
]

export const overrideSet = {
  id: 'os111111-1111-4111-8111-111111111111',
  revision: 0,
  status: 'DRAFT' as 'DRAFT' | 'MATERIALIZED' | 'ABANDONED',
  createdAt: '2026-09-07T09:00:00.000Z',
  updatedAt: '2026-09-07T09:00:00.000Z',
}

type DecisionFixture = {
  id: string
  sequence: number
  decision: 'ACCEPT' | 'REJECT'
  targetCode: string | null
  targetEffectiveFrom: string | null
  reason: string
  supersedesDecisionId: string | null
  supersededById: string | null
  decidedAt: string
}

/** Every decision ever appended, newest last, keyed by the row it is about. */
export const decisionHistory = new Map<string, DecisionFixture[]>()
/** The effective decision per row — one, by construction. */
export const decisions = new Map<string, DecisionFixture>()

export const materialisedSets: {
  id: string
  revision: number
  datasetVersionId: string | null
  materializedAt: string | null
}[] = []

/** Restores the fixtures between tests; the draft is mutable by design. */
export function resetSourceDrift(): void {
  overrideSet.revision = 0
  overrideSet.status = 'DRAFT'
  decisions.clear()
  decisionHistory.clear()
  materialisedSets.length = 0
}

function decide(
  rowId: string,
  decision: 'ACCEPT' | 'REJECT',
  body: {
    targetCode?: string
    targetEffectiveFrom?: string
    reason: string
    expectedRevision: number
  },
) {
  if (overrideSet.status !== 'DRAFT') {
    return envelope(409, 'OVERRIDE_SET_NOT_DRAFT', 'the set is no longer a draft')
  }
  if (body.expectedRevision !== overrideSet.revision) {
    return envelope(
      409,
      'OVERRIDE_SET_REVISION_CONFLICT',
      'the override set moved while you were deciding',
    )
  }
  const row = quarantineRows.find((r) => r.id === rowId)
  if (!row) return envelope(404, 'QUARANTINE_ROW_NOT_FOUND', 'no such row')
  if (decision === 'ACCEPT') {
    const candidate = row.candidates.find((c) => c.code === body.targetCode)
    if (!candidate) return envelope(409, 'OVERRIDE_TARGET_NOT_FOUND', 'no such target')
    if (!candidate.selectable) {
      return envelope(409, 'OVERRIDE_TARGET_NOT_CURRENT', 'not an active commune')
    }
  }

  const previous = decisions.get(rowId) ?? null
  overrideSet.revision += 1
  const appended: DecisionFixture = {
    id: `d${overrideSet.revision}-${rowId.slice(0, 8)}`,
    sequence: overrideSet.revision,
    decision,
    targetCode: decision === 'ACCEPT' ? (body.targetCode ?? null) : null,
    targetEffectiveFrom: decision === 'ACCEPT' ? (body.targetEffectiveFrom ?? null) : null,
    reason: body.reason,
    supersedesDecisionId: previous?.id ?? null,
    supersededById: null,
    decidedAt: '2026-09-07T10:00:00.000Z',
  }
  if (previous) previous.supersededById = appended.id
  decisions.set(rowId, appended)
  decisionHistory.set(rowId, [...(decisionHistory.get(rowId) ?? []), appended])

  return HttpResponse.json(
    {
      decisionId: appended.id,
      overrideSetId: overrideSet.id,
      overrideSetRevision: overrideSet.revision,
      decision,
      quarantineRowId: rowId,
      supersededDecisionId: previous?.id ?? null,
      decidedAt: appended.decidedAt,
    },
    { status: 201 },
  )
}

function stateOf(rowId: string): 'UNDECIDED' | 'ACCEPTED_DRAFT' | 'REJECTED_DRAFT' | 'SUPERSEDED' {
  const effective = decisions.get(rowId)
  if (effective) return effective.decision === 'ACCEPT' ? 'ACCEPTED_DRAFT' : 'REJECTED_DRAFT'
  return decisionHistory.has(rowId) ? 'SUPERSEDED' : 'UNDECIDED'
}

function quarantineListItem(row: QuarantineFixture) {
  return {
    id: row.id,
    classification: row.classification,
    validationReason: row.validationReason,
    source: { code: row.oldCode, name: row.oldName },
    proposedTarget: { code: row.newCode, name: row.newName },
    upstreamFlags: { isDividedWard: true, isMergedWard: false },
    candidateCount: row.candidates.length,
    affectedPlaceCount: row.affectedPlaceCount,
    decisionState: stateOf(row.id),
    decidedAt: decisions.get(row.id)?.decidedAt ?? null,
    sourceProvenance: 'namnh92/vietnam-admin@7fac8c45:mapping.json',
  }
}

function identity(code: string, name: string, level: string, status: string) {
  return {
    code,
    name,
    unitType: level === 'COMMUNE' ? 'WARD' : 'LEGACY_DISTRICT',
    level,
    effectiveFrom: '2025-07-01',
    effectiveTo: null,
    parentCode: '01',
    status,
  }
}

function quarantineDetail(row: QuarantineFixture) {
  const history = [...(decisionHistory.get(row.id) ?? [])].reverse()
  return {
    id: row.id,
    datasetVersionId: '11111111-1111-4111-8111-111111111111',
    classification: row.classification,
    validationReason: row.validationReason,
    sourceProvenance: 'namnh92/vietnam-admin@7fac8c45:mapping.json',
    combinedDatasetVersion: 'v5.0.0+v2.4.1+7fac8c45+none+r0',
    upstreamFlags: { isDividedWard: true },
    rawPayload: {
      value: { ward: row.oldName, newWard: row.newName, isDividedWard: true },
      truncated: false,
    },
    source: identity(row.oldCode, row.oldName, 'COMMUNE', 'INACTIVE'),
    candidates: row.candidates.map((c) => ({
      ...identity(c.code, c.name, c.selectable ? 'COMMUNE' : 'LEGACY_DISTRICT', 'ACTIVE'),
      proposedByUpstream: c.code === row.newCode,
      hierarchyValid: c.hierarchyValid,
      selectable: c.selectable,
    })),
    affectedPlaces: {
      total: row.affectedPlaceCount,
      samples: [
        {
          placeId: 'p1111111-1111-4111-8111-111111111111',
          name: 'Quán Cơm Ba Đình',
          code: row.oldCode,
          status: 'published',
        },
      ],
      truncated: row.affectedPlaceCount > 1,
      sampleLimit: 20,
    },
    overrideSet: {
      id: overrideSet.status === 'DRAFT' ? overrideSet.id : null,
      revision: overrideSet.revision,
      status: overrideSet.status,
    },
    decision: decisions.get(row.id) ?? null,
    decisionState: stateOf(row.id),
    history,
  }
}

function quarantineCounts() {
  const accepted = [...decisions.values()].filter((d) => d.decision === 'ACCEPT').length
  const rejected = [...decisions.values()].filter((d) => d.decision === 'REJECT').length
  return {
    // Nine times the backlog, and the reason the two must never be summed.
    canonical: { MERGED: 9432, RENAMED: 132, REASSIGNED: 5 },
    backlog: { DIVIDED_REQUIRES_REVIEW: 1033 },
    decisions: {
      UNDECIDED: 1033 - accepted - rejected,
      ACCEPTED_DRAFT: accepted,
      REJECTED_DRAFT: rejected,
      SUPERSEDED: 0,
    },
  }
}

/** CMS #156 — per-place mapping fixtures. Mutable: the decisions move them. */
export const ACTIVE_DATASET_VERSION = 'v5.0.0+v2.4.1+7fac8c45+none+r0'

type MappingFixture = {
  placeId: string
  name: string
  placeStatus: string
  status: 'UNMAPPED' | 'AUTO_MATCHED' | 'NEEDS_REVIEW' | 'VERIFIED' | 'REJECTED' | 'STALE'
  addressText: string
  city: string | null
  district: string | null
  provinceCode: string | null
  communeCode: string | null
  method: string | null
  confidence: string | null
  datasetVersion: string | null
  reviewer: { id: string; displayName: string } | null
  updatedAt: string
  /** Whether the stored identity still resolves. Drives the stale verdict. */
  identityValid: boolean
}

export const PROVINCES = [
  { code: '01', name: 'Hà Nội', fullName: 'Thành phố Hà Nội' },
  { code: '79', name: 'Hồ Chí Minh', fullName: 'Thành phố Hồ Chí Minh' },
]

export const COMMUNES: Record<string, { code: string; name: string; fullName: string }[]> = {
  '01': [
    { code: '00163', name: 'Ba Đình', fullName: 'Phường Ba Đình' },
    { code: '00166', name: 'Ngọc Hà', fullName: 'Phường Ngọc Hà' },
  ],
  '79': [{ code: '26734', name: 'Bến Nghé', fullName: 'Phường Bến Nghé' }],
}

const BASE_MAPPINGS: MappingFixture[] = [
  {
    placeId: 'm1111111-1111-4111-8111-111111111111',
    name: 'Quán Cơm Ba Đình',
    placeStatus: 'review',
    status: 'NEEDS_REVIEW',
    addressText: '12 Đội Cấn, Ba Đình, Hà Nội',
    city: 'Hà Nội',
    district: 'Ba Đình',
    provinceCode: '01',
    communeCode: null,
    method: 'exact_name',
    confidence: null,
    datasetVersion: ACTIVE_DATASET_VERSION,
    reviewer: null,
    updatedAt: '2026-09-07T09:00:00.000Z',
    identityValid: true,
  },
  {
    placeId: 'm2222222-2222-4222-8222-222222222222',
    name: 'Cà Phê Ngọc Hà',
    placeStatus: 'published',
    status: 'STALE',
    addressText: '5 Hoàng Hoa Thám, Hà Nội',
    city: 'Hà Nội',
    district: 'Ba Đình',
    provinceCode: '01',
    communeCode: '00166',
    method: 'boundary_point_in_polygon',
    confidence: '1.00',
    datasetVersion: 'v4.9.0+v2.4.0+7fac8c45+none+r0',
    reviewer: { id: 'ad-9', displayName: 'moderator.cũ' },
    updatedAt: '2026-09-07T09:05:00.000Z',
    identityValid: false,
  },
  {
    placeId: 'm3333333-3333-4333-8333-333333333333',
    name: 'Bún Chả Bến Nghé',
    placeStatus: 'review',
    status: 'UNMAPPED',
    addressText: '1 Đồng Khởi, Quận 1, TP.HCM',
    city: 'Hồ Chí Minh',
    district: 'Quận 1',
    provinceCode: null,
    communeCode: null,
    method: null,
    confidence: null,
    datasetVersion: null,
    reviewer: null,
    updatedAt: '2026-09-07T09:10:00.000Z',
    identityValid: false,
  },
  {
    placeId: 'm4444444-4444-4444-8444-444444444444',
    name: 'Phở Ba Đình',
    placeStatus: 'published',
    status: 'VERIFIED',
    addressText: '20 Núi Trúc, Hà Nội',
    city: 'Hà Nội',
    district: 'Ba Đình',
    provinceCode: '01',
    communeCode: '00163',
    method: 'editor',
    confidence: null,
    datasetVersion: 'v4.9.0+v2.4.0+7fac8c45+none+r0',
    reviewer: { id: 'ad-2', displayName: 'moderator' },
    updatedAt: '2026-09-07T09:15:00.000Z',
    // Valid under a newer dataset: REVALIDATED, and emphatically not stale.
    identityValid: true,
  },
]

export const mappingRows: MappingFixture[] = BASE_MAPPINGS.map((row) => ({ ...row }))

export function resetMappingModeration(): void {
  mappingRows.splice(0, mappingRows.length, ...BASE_MAPPINGS.map((row) => ({ ...row })))
}

function blocksApproval(row: MappingFixture): boolean {
  return row.status !== 'VERIFIED'
}

function mappingListItem(row: MappingFixture) {
  return {
    placeId: row.placeId,
    name: row.name,
    placeStatus: row.placeStatus,
    mappingStatus: row.status,
    provinceCode: row.provinceCode,
    communeCode: row.communeCode,
    datasetVersion: row.datasetVersion,
    updatedAt: row.updatedAt,
    blocksApproval: blocksApproval(row),
  }
}

function mappingCounts() {
  const counts: Record<string, number> = {
    UNMAPPED: 0,
    AUTO_MATCHED: 0,
    NEEDS_REVIEW: 0,
    VERIFIED: 0,
    REJECTED: 0,
    STALE: 0,
  }
  for (const row of mappingRows) counts[row.status] = (counts[row.status] ?? 0) + 1
  counts.actionable = (counts.NEEDS_REVIEW ?? 0) + (counts.STALE ?? 0)
  return counts
}

function staleVerdict(row: MappingFixture) {
  const sameVersion = row.datasetVersion === ACTIVE_DATASET_VERSION
  const reason = !row.communeCode
    ? 'NO_MAPPING'
    : !row.identityValid
      ? 'UNIT_NOT_IN_ACTIVE_DATASET'
      : sameVersion
        ? 'CURRENT'
        : // Labelled with an older version and still true. Healthy, not stale.
          'REVALIDATED'
  return {
    stale: reason === 'UNIT_NOT_IN_ACTIVE_DATASET',
    reason,
    reviewerOwned: row.reviewer !== null,
    requiresReview: reason === 'UNIT_NOT_IN_ACTIVE_DATASET',
    storedDatasetVersion: row.datasetVersion,
    activeDatasetVersion: ACTIVE_DATASET_VERSION,
  }
}

function approvalBlock(row: MappingFixture) {
  if (!blocksApproval(row)) return null
  const code =
    row.status === 'UNMAPPED'
      ? 'MAPPING_UNMAPPED'
      : row.status === 'REJECTED'
        ? 'MAPPING_REJECTED'
        : row.status === 'STALE'
          ? 'MAPPING_STALE'
          : 'MAPPING_NOT_VERIFIED'
  return { code, message: code }
}

/**
 * What each role may do, mirroring GoGo-BE's own `permittedActions`. The screen
 * gates every button on this rather than on a role name.
 */
function permittedActions(row: MappingFixture): string[] {
  const role = currentActor().role
  const moderator = role === 'moderator' || role === 'super_admin'
  const ops = role === 'ops_admin' || role === 'super_admin'
  const actions = ['view']
  if (moderator) {
    if (row.status === 'VERIFIED') actions.push('correct')
    else actions.push('verify', 'reject')
    if (['REJECTED', 'NEEDS_REVIEW', 'STALE'].includes(row.status)) actions.push('rematch')
  }
  if (ops) actions.push('reconcile')
  return actions
}

function mappingDetail(row: MappingFixture) {
  const province = PROVINCES.find((p) => p.code === row.provinceCode)
  const commune = row.provinceCode
    ? COMMUNES[row.provinceCode]?.find((c) => c.code === row.communeCode)
    : undefined
  return {
    placeId: row.placeId,
    place: {
      name: row.name,
      status: row.placeStatus,
      addressText: row.addressText,
      city: row.city,
      district: row.district,
      geometry: { lng: 105.8342, lat: 21.0278 },
      updatedAt: row.updatedAt,
    },
    mapping: {
      status: row.status,
      provinceCode: row.provinceCode,
      communeCode: row.communeCode,
      legacyDistrictCode: null,
      provinceName: province?.fullName ?? null,
      communeName: commune?.fullName ?? null,
      legacyDistrictName: null,
      method: row.method,
      confidence: row.confidence,
      datasetVersion: row.datasetVersion,
      boundaryVersion: row.datasetVersion ? 'v5.0.0' : null,
      mappedAt: row.datasetVersion ? row.updatedAt : null,
      reviewer: row.reviewer,
    },
    activeDatasetVersion: ACTIVE_DATASET_VERSION,
    evidence:
      row.status === 'UNMAPPED'
        ? []
        : [
            {
              method: row.method ?? 'exact_name',
              provinceCode: row.provinceCode,
              communeCode: row.communeCode,
              hierarchyValid: row.identityValid,
              deterministic: row.confidence !== null,
              detail: 'Tên phường khớp chính xác trong tỉnh đã lưu.',
            },
          ],
    candidates:
      row.status === 'NEEDS_REVIEW'
        ? [
            {
              method: 'exact_name',
              provinceCode: '01',
              communeCode: '00163',
              detail: 'Phường Ba Đình — tên khớp',
            },
            {
              method: 'exact_name',
              provinceCode: '01',
              communeCode: '00166',
              detail: 'Phường Ngọc Hà — tên khớp',
            },
          ]
        : [],
    unresolvedReason: row.status === 'NEEDS_REVIEW' ? 'AMBIGUOUS_NAME' : null,
    hierarchyValid: row.identityValid,
    staleness: staleVerdict(row),
    approval: { blocked: blocksApproval(row), block: approvalBlock(row) },
    permittedActions: permittedActions(row),
  }
}

/** The display name of a fixture unit code, at either level. */
function unitNameFor(code: string): string | null {
  const province = PROVINCES.find((p) => p.code === code)
  if (province) return province.fullName
  for (const communes of Object.values(COMMUNES)) {
    const commune = communes.find((c) => c.code === code)
    if (commune) return commune.fullName
  }
  return null
}

/** Accent-insensitive, the way GoGo-BE normalises Vietnamese for search. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase()
}

/**
 * One page of administrative units, with the real API's limits.
 *
 * The 400 is the point of this helper. `fetchCommunes` used to send `limit=500`
 * against a maximum of 200; DEV answered 400 and the reviewer's commune box
 * went empty, while every test passed against a fixture that cheerfully
 * returned everything for any limit. A fixture more permissive than the server
 * is a fixture that certifies a broken client.
 */
function unitPage(request: Request, rows: ReturnType<typeof unitDto>[]) {
  const url = new URL(request.url)
  const rawLimit = url.searchParams.get('limit')
  const limit = rawLimit === null ? 50 : Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return envelope(400, 'VALIDATION_FAILED', `limit must be between 1 and 200, got ${rawLimit}`)
  }
  const cursor = url.searchParams.get('cursor')
  // The real cursor is the last code returned, base64url-encoded.
  const after = cursor ? atob(cursor.replace(/-/g, '+').replace(/_/g, '/')) : null
  const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code))
  const start = after ? sorted.findIndex((r) => r.code > after) : 0
  const from = start === -1 ? sorted.length : start
  const page = sorted.slice(from, from + limit)
  const more = from + page.length < sorted.length
  const last = page.at(-1)
  return HttpResponse.json({
    items: page,
    nextCursor: more && last ? btoa(last.code).replace(/\+/g, '-').replace(/\//g, '_') : null,
    total: sorted.length,
    datasetVersion: ACTIVE_DATASET_VERSION,
  })
}

function unitDto(
  unit: { code: string; name: string; fullName: string },
  level: 'PROVINCE' | 'COMMUNE',
  parentCode: string | null,
) {
  return {
    ...unit,
    nameEn: null,
    codeName: null,
    unitType: level === 'PROVINCE' ? 'MUNICIPALITY' : 'WARD',
    level,
    parentCode,
    status: 'ACTIVE',
    effectiveFrom: '2025-07-01',
    effectiveTo: null,
    isCurrent: true,
  }
}
