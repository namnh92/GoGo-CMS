import { apiFetch, apiFetchParsed, newIdempotencyKey } from '@/shared/api/client'
import {
  auditListSchema,
  cmsPlaceDetailSchema,
  duplicateListSchema,
  placeListSchema,
  staleListSchema,
  type AuditEntry,
  type CmsPlaceDetail,
  type DuplicatePair,
  type PlaceHour,
  type PlaceStatus,
  type PriceUnit,
} from '@/shared/api/contracts'

export type PlaceListFilters = {
  status?: PlaceStatus | 'all'
  q?: string
  limit?: number
}

export function fetchPlaces(filters: PlaceListFilters, signal?: AbortSignal) {
  return apiFetchParsed(placeListSchema, '/cms/places', {
    query: {
      status: filters.status && filters.status !== 'all' ? filters.status : undefined,
      q: filters.q,
      limit: filters.limit ?? 50,
    },
    signal,
  })
}

/** ⚠ Not yet in openapi/gogo.v1.yaml (only PATCH is). Tracked in README. */
export function fetchPlace(id: string, signal?: AbortSignal): Promise<CmsPlaceDetail> {
  return apiFetchParsed(cmsPlaceDetailSchema, `/cms/places/${id}`, { signal })
}

export function fetchStalePlaces(days: number, signal?: AbortSignal) {
  return apiFetchParsed(staleListSchema, '/cms/places/stale', {
    query: { days, limit: 100 },
    signal,
  })
}

export function fetchDuplicates(signal?: AbortSignal): Promise<{ items: DuplicatePair[] }> {
  return apiFetchParsed(duplicateListSchema, '/cms/places/duplicates', {
    query: { limit: 100 },
    signal,
  })
}

/** ⚠ Not yet in openapi/gogo.v1.yaml. Audit is a feature, so the UI needs it. */
export function fetchPlaceAudit(
  id: string,
  signal?: AbortSignal,
): Promise<{ items: AuditEntry[] }> {
  return apiFetchParsed(auditListSchema, `/cms/places/${id}/audit`, { signal })
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

export function setPlaceHours(id: string, hours: PlaceHour[]) {
  return apiFetch(`/cms/places/${id}/hours`, { method: 'PUT', body: { hours } })
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
