import { apiFetch, apiFetchParsed, newIdempotencyKey } from '@/shared/api/client'
import {
  auditPageSchema,
  cmsAreaListSchema,
  cmsPlaceDetailSchema,
  duplicateListSchema,
  placeListSchema,
  staleListSchema,
  type AuditPage,
  type CmsArea,
  type CmsPlaceDetail,
  type DuplicatePair,
  type PlaceHourInput,
  type PlaceSort,
  type PlaceSourceFilter,
  type PlaceStatus,
  type PriceUnit,
  type StalePlace,
} from '@/shared/api/contracts'

/** Every parameter `GET /cms/places` actually accepts (GoGo-BE#141). */
export type PlaceListFilters = {
  status?: PlaceStatus | 'all'
  q?: string
  areaKey?: string
  category?: string
  source?: PlaceSourceFilter | 'all'
  staleDays?: number
  sort?: PlaceSort
  direction?: 'asc' | 'desc'
  limit?: number
  cursor?: string | null
}

export function fetchPlaces(filters: PlaceListFilters, signal?: AbortSignal) {
  return apiFetchParsed(placeListSchema, '/cms/places', {
    query: {
      status: filters.status && filters.status !== 'all' ? filters.status : undefined,
      q: filters.q,
      areaKey: filters.areaKey,
      category: filters.category,
      source: filters.source && filters.source !== 'all' ? filters.source : undefined,
      staleDays: filters.staleDays,
      sort: filters.sort ?? 'updated_at',
      direction: filters.direction ?? 'desc',
      limit: filters.limit ?? 50,
      // Keyset, not offset: the catalog is written to while editors browse it,
      // so an offset would repeat or skip rows.
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

/** `cmsGetPlace` — every field the editor writes, plus hours/prices/sources/media. */
export function fetchPlace(id: string, signal?: AbortSignal): Promise<CmsPlaceDetail> {
  return apiFetchParsed(cmsPlaceDetailSchema, `/cms/places/${id}`, { signal })
}

export type AreaFilters = {
  q?: string
  city?: string
  /**
   * Retired areas. Asked for whenever a value a place already holds has to be
   * rendered: a place filed under a retired area must still resolve its label,
   * and dropping it would make the picker hide the very value it exists to
   * show.
   */
  includeInactive?: boolean
}

/** `cmsListAreas` (GoGo-BE#425) — the vocabulary behind `areaKey`. */
export async function fetchAreas(filters: AreaFilters, signal?: AbortSignal): Promise<CmsArea[]> {
  const { items } = await apiFetchParsed(cmsAreaListSchema, '/cms/areas', {
    query: {
      q: filters.q,
      city: filters.city,
      includeInactive: filters.includeInactive ? 'true' : undefined,
    },
    signal,
  })
  return items
}

/** The endpoint returns raw snake_case rows; normalize at the boundary. */
export async function fetchStalePlaces(days: number, signal?: AbortSignal): Promise<StalePlace[]> {
  const rows = await apiFetchParsed(staleListSchema, '/cms/places/stale', {
    query: { days, limit: 100 },
    signal,
  })
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    freshnessCheckedAt: row.freshness_checked_at,
  }))
}

/**
 * Pairs come back as `place_a`/`place_b` with no notion of which side wins —
 * `a` is simply the lower id. The UI treats `a` as canonical and lets the
 * operator swap, because the API decides nothing here either.
 */
export async function fetchDuplicates(signal?: AbortSignal): Promise<DuplicatePair[]> {
  const rows = await apiFetchParsed(duplicateListSchema, '/cms/places/duplicates', {
    query: { limit: 100 },
    signal,
  })
  return rows.map((row) => ({
    canonicalId: row.place_a,
    canonicalName: row.name_a,
    duplicateId: row.place_b,
    duplicateName: row.name_b,
    similarity: row.name_similarity,
    distanceMeters: row.distance_m,
  }))
}

/**
 * `cmsListPlaceAudit` — the change history behind the editor's drawer.
 *
 * Keyset-paged like the global log: the audit table is appended to while it is
 * being read, so an offset would repeat or skip rows.
 */
export function fetchPlaceAudit(
  id: string,
  cursor?: string | null,
  signal?: AbortSignal,
): Promise<AuditPage> {
  return apiFetchParsed(auditPageSchema, `/cms/places/${id}/audit`, {
    query: { limit: 20, cursor: cursor ?? undefined },
    signal,
  })
}

/**
 * Body mirrors `cmsUpdatePlace` in openapi/gogo.v1.yaml exactly.
 *
 * `null` and `undefined` are different instructions here (GoGo-BE#425): `null`
 * clears the column, an absent key leaves it — and its recorded provenance —
 * untouched. `?: T | null` is therefore the type, never `?: T`.
 */
export type UpdatePlaceInput = {
  name?: string
  description?: string | null
  addressText?: string | null
  /** A `cmsListAreas` key: the discovery area, not the postal address. */
  areaKey?: string | null
  city?: string | null
  district?: string | null
  /** Sent as typed; GoGo-BE normalizes to E.164 and answers on `phone`. */
  phone?: string | null
  /** Sent as typed; GoGo-BE enforces http(s) and answers on `website`. */
  website?: string | null
  lat?: number
  lng?: number
  avgVisitMinutes?: number | null
  suitability?: Record<string, number>
  isLodging?: boolean
  curatedRank?: number | null
  taxonomyIds?: string[]
  /** Optimistic concurrency; a mismatch answers `409 PLACE_MODIFIED`. */
  expectedUpdatedAt?: string
}

export function updatePlace(id: string, input: UpdatePlaceInput) {
  return apiFetch(`/cms/places/${id}`, { method: 'PATCH', body: input })
}

export function transitionPlace(id: string, status: PlaceStatus) {
  return apiFetch(`/cms/places/${id}/status`, {
    method: 'PATCH',
    body: { status },
    idempotencyKey: newIdempotencyKey(),
  })
}

/**
 * Replaces the whole week. `source` and `verifiedAt` come back on read but are
 * not writable — the server stamps them as editor-verified, which is the point
 * of the endpoint (it also bumps freshness).
 */
export function setPlaceHours(id: string, hours: PlaceHourInput[], expectedUpdatedAt?: string) {
  return apiFetch(`/cms/places/${id}/hours`, {
    method: 'PUT',
    body: {
      // Optimistic concurrency (GoGo-BE#425): a week built on a stale form is
      // refused `409 PLACE_MODIFIED` rather than silently winning.
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
      hours: hours.map((hour) => ({
        dayOfWeek: hour.dayOfWeek,
        kind: hour.kind,
        openMinute: hour.openMinute,
        closeMinute: hour.closeMinute,
        isOvernight: hour.isOvernight,
        // Absent means `editor`. Only sent for a row being carried back
        // unchanged, so re-saving a provider week is not recorded as a
        // verification nobody performed (GoGo-BE#425).
        ...(hour.source ? { source: hour.source } : {}),
      })),
    },
  })
}

export function addPlacePrice(
  id: string,
  input: { priceMin: number; priceMax: number; unit: PriceUnit },
) {
  return apiFetch(`/cms/places/${id}/prices`, {
    method: 'POST',
    body: input,
    idempotencyKey: newIdempotencyKey(),
  })
}

export function verifyFreshness(id: string) {
  return apiFetch(`/cms/places/${id}/verify-freshness`, {
    method: 'POST',
    idempotencyKey: newIdempotencyKey(),
  })
}

/** References move to `id`; the duplicate is archived, never deleted. */
export function mergePlace(id: string, duplicateId: string) {
  return apiFetch(`/cms/places/${id}/merge`, {
    method: 'POST',
    body: { duplicateId },
    idempotencyKey: newIdempotencyKey(),
  })
}
