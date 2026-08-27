import { http, HttpResponse } from 'msw'
import type { AdminRole, CollectionStatus, PlaceStatus } from '@/shared/api/contracts'
import type { ImportRow } from '@/shared/api/contracts-import'
import {
  auditEntries,
  collections,
  duplicatePairs,
  featureFlags,
  importJobs,
  importRows,
  moderationQueue,
  opsKpis,
  places,
  rankingBounds,
  rankingConfigs,
  taxonomies,
} from './fixtures'

const BASE = '/v1'

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
  duplicates: duplicatePairs.map((pair) => ({ ...pair })),
  moderation: JSON.parse(JSON.stringify(moderationQueue)) as typeof moderationQueue,
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

/** Dev accounts. `role` is chosen by the local part of the email. */
function roleFromEmail(email: string): AdminRole {
  const local = email.split('@')[0]?.toLowerCase() ?? ''
  if (local.includes('moderator')) return 'moderator'
  if (local.includes('editor')) return 'editor'
  if (local.includes('ops')) return 'ops_admin'
  return 'super_admin'
}

export const handlers = [
  http.post(`${BASE}/cms/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string; totp?: string }
    if (!body.email || !body.password) return envelope(401, 'UNAUTHORIZED', 'bad credentials')
    // Exercise the MFA branch: any account with no code gets asked once.
    if (!body.totp) return envelope(401, 'MFA_REQUIRED', 'totp required')
    if (!/^\d{6}$/.test(body.totp)) return envelope(401, 'MFA_REQUIRED', 'totp invalid')
    const role = roleFromEmail(body.email)
    return HttpResponse.json(
      {
        accessToken: 'mock-access-token',
        role,
        displayName: body.email.split('@')[0],
        expiresIn: 900,
      },
      { status: 201 },
    )
  }),

  http.get(`${BASE}/cms/ops/kpis`, () => HttpResponse.json(opsKpis)),

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
    return HttpResponse.json({ items, total: items.length, nextCursor: null })
  }),

  http.get(`${BASE}/cms/places/stale`, () =>
    HttpResponse.json({
      items: db.places
        .filter((place) => place.status === 'published')
        .map((place) => ({ ...place, staleDays: place.freshnessVerifiedAt ? 14 : 999 })),
    }),
  ),

  http.get(`${BASE}/cms/places/duplicates`, () => HttpResponse.json({ items: db.duplicates })),

  http.get(`${BASE}/cms/places/:id/audit`, () => HttpResponse.json({ items: auditEntries })),

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
    place.updatedBy = 'ban'
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
    const body = (await request.json()) as { hours: typeof place.hours }
    place.hours = body.hours
    place.freshnessVerifiedAt = new Date().toISOString()
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
        unit: body.unit as (typeof place.prices)[number]['unit'],
        observedAt: new Date().toISOString(),
        observedBy: 'ban',
      },
    ]
    return HttpResponse.json(place, { status: 201 })
  }),

  http.post(`${BASE}/cms/places/:id/verify-freshness`, ({ params }) => {
    const place = db.places.find((item) => item.id === params.id)
    if (!place) return envelope(404, 'NOT_FOUND', 'place not found')
    place.freshnessVerifiedAt = new Date().toISOString()
    return HttpResponse.json(place, { status: 201 })
  }),

  http.post(`${BASE}/cms/places/:id/merge`, async ({ params, request }) => {
    const body = (await request.json()) as { duplicateId: string }
    db.duplicates = db.duplicates.filter(
      (pair) => !(pair.canonical.id === params.id && pair.duplicate.id === body.duplicateId),
    )
    return HttpResponse.json({ merged: true }, { status: 201 })
  }),

  http.get(`${BASE}/cms/taxonomies`, () => HttpResponse.json({ items: db.taxonomies })),

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
    taxonomy.synonyms = [...taxonomy.synonyms, { term: body.term, locale: body.locale ?? 'vi' }]
    return HttpResponse.json(taxonomy, { status: 201 })
  }),

  http.get(`${BASE}/cms/collections`, ({ request }) => {
    const status = new URL(request.url).searchParams.get('status')
    const items = status ? db.collections.filter((item) => item.status === status) : db.collections
    return HttpResponse.json({ items })
  }),

  http.post(`${BASE}/cms/collections`, async ({ request }) => {
    const body = (await request.json()) as { slug: string; title: string }
    const created = {
      id: `col-${body.slug}`,
      slug: body.slug,
      locale: 'vi',
      title: body.title,
      description: null,
      status: 'draft' as CollectionStatus,
      startsAt: null,
      endsAt: null,
      coverUrl: null,
      items: [],
      updatedAt: new Date().toISOString(),
      updatedBy: 'ban',
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

  http.put(`${BASE}/cms/collections/:id/items`, async ({ params, request }) => {
    const collection = db.collections.find((item) => item.id === params.id)
    if (!collection) return envelope(404, 'NOT_FOUND', 'collection not found')
    const body = (await request.json()) as { placeIds: string[] }
    const byId = new Map(collection.items.map((item) => [item.placeId, item]))
    collection.items = body.placeIds.map(
      (placeId) =>
        byId.get(placeId) ?? {
          placeId,
          name: placeId,
          addressText: null,
          coverUrl: null,
          note: null,
        },
    )
    return HttpResponse.json(collection)
  }),

  http.get(`${BASE}/cms/moderation`, () => HttpResponse.json(db.moderation)),

  http.post(`${BASE}/cms/moderation/:kind/:id`, async ({ params, request }) => {
    const body = (await request.json()) as { decision: string; reason: string }
    if (!body.reason || body.reason.trim().length < 3) {
      return envelope(400, 'REASON_REQUIRED', 'reason is mandatory')
    }
    const key =
      params.kind === 'reviews' ? 'reviews' : params.kind === 'reports' ? 'reports' : 'checkins'
    db.moderation[key] = db.moderation[key].filter((item) => item.id !== params.id) as never
    db.moderation.stats.pending = Math.max(0, db.moderation.stats.pending - 1)
    db.moderation.stats.resolvedToday += 1
    return HttpResponse.json({ decided: true }, { status: 201 })
  }),

  http.post(`${BASE}/cms/place-submissions/:id/decide`, async ({ params, request }) => {
    const body = (await request.json()) as { decision: string; reason: string }
    if (!body.reason || body.reason.trim().length < 3) {
      return envelope(400, 'REASON_REQUIRED', 'reason is mandatory')
    }
    db.moderation.submissions = db.moderation.submissions.filter((item) => item.id !== params.id)
    return HttpResponse.json({ decided: true }, { status: 201 })
  }),

  http.get(`${BASE}/cms/ranking-configs`, () =>
    HttpResponse.json({ items: db.configs, bounds: rankingBounds }),
  ),

  http.post(`${BASE}/cms/ranking-configs`, async ({ request }) => {
    const body = (await request.json()) as { key: string; weights: Record<string, number> }
    const created = {
      id: `rc-${db.configs.length + 1}`,
      key: body.key as (typeof db.configs)[number]['key'],
      version: Math.max(...db.configs.map((config) => config.version)) + 1,
      status: 'draft' as const,
      weights: body.weights,
      createdBy: 'ban',
      createdAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
      activatedAt: null,
    }
    db.configs = [created, ...db.configs]
    return HttpResponse.json(created, { status: 201 })
  }),

  http.post(`${BASE}/cms/ranking-configs/:id/approve`, ({ params }) => {
    const config = db.configs.find((item) => item.id === params.id)
    if (!config) return envelope(404, 'NOT_FOUND', 'config not found')
    // Four-eyes is a server rule; the mock enforces it so the UI can be tested.
    if (config.createdBy === 'ban')
      return envelope(403, 'SELF_APPROVAL', 'creator cannot self-approve')
    config.status = 'approved'
    config.approvedBy = 'ban'
    config.approvedAt = new Date().toISOString()
    return HttpResponse.json(config, { status: 201 })
  }),

  http.post(`${BASE}/cms/ranking-configs/:id/activate`, ({ params }) => {
    const config = db.configs.find((item) => item.id === params.id)
    if (!config) return envelope(404, 'NOT_FOUND', 'config not found')
    if (config.status !== 'approved') return envelope(409, 'CONFLICT', 'config is not approved')
    for (const other of db.configs) if (other.status === 'active') other.status = 'superseded'
    config.status = 'active'
    config.activatedAt = new Date().toISOString()
    return HttpResponse.json(config, { status: 201 })
  }),

  http.post(`${BASE}/cms/ranking-configs/:key/rollback`, () => {
    for (const config of db.configs) if (config.status === 'active') config.status = 'superseded'
    return HttpResponse.json({ rolledBack: true }, { status: 201 })
  }),

  http.get(`${BASE}/cms/feature-flags`, () => HttpResponse.json({ items: db.flags })),

  http.put(`${BASE}/cms/feature-flags/:key`, async ({ params, request }) => {
    const flag = db.flags.find((item) => item.key === params.key)
    if (!flag) return envelope(404, 'NOT_FOUND', 'flag not found')
    const body = (await request.json()) as { enabled: boolean }
    flag.enabled = body.enabled
    flag.updatedBy = 'ban'
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
