import { apiFetch, apiFetchParsed, newIdempotencyKey } from '@/shared/api/client'
import {
  auditPageSchema,
  cmsPlaceDetailSchema,
  duplicateListSchema,
  placeListSchema,
  staleListSchema,
  type AuditPage,
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

/** Body mirrors `cmsUpdatePlace` in openapi/gogo.v1.yaml exactly. */
export type UpdatePlaceInput = {
  name?: string
  description?: string
  addressText?: string
  areaKey?: string
  lat?: number
  lng?: number
  avgVisitMinutes?: number
  suitability?: Record<string, number>
  isLodging?: boolean
  curatedRank?: number | null
  taxonomyIds?: string[]
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
export function setPlaceHours(id: string, hours: PlaceHourInput[]) {
  return apiFetch(`/cms/places/${id}/hours`, {
    method: 'PUT',
    body: {
      hours: hours.map((hour) => ({
        dayOfWeek: hour.dayOfWeek,
        openMinute: hour.openMinute,
        closeMinute: hour.closeMinute,
        isOvernight: hour.isOvernight,
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
