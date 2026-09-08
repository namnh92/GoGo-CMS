import { apiFetch, apiFetchParsed, newIdempotencyKey } from '@/shared/api/client'
import {
  attachableMediaListSchema,
  auditPageSchema,
  cmsAreaListSchema,
  cmsPlaceDetailSchema,
  duplicateListSchema,
  placeListSchema,
  placeMediaSchema,
  staleListSchema,
  type AttachableMedia,
  type AuditPage,
  type CmsArea,
  type CmsPlaceDetail,
  type DuplicatePair,
  type PlaceHourInput,
  type PlaceMedia,
  type PlaceAdministrativeCounts,
  placeAdministrativeCountsSchema,
  type PlaceMediaModeration,
  type PlaceSort,
  type PlaceSourceFilter,
  type PlaceStatus,
  type PriceUnit,
  resolveLinkResultSchema,
  type ResolveLinkResult,
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
  /**
   * ADM-018 — the canonical administrative address, as codes. Free-text `city`,
   * `district` and the curated `areaKey` never influence this: the codes do.
   * `communeCode` needs its province, and the server validates the pair.
   */
  provinceCode?: string
  communeCode?: string
  /**
   * `grouped` — placeable in the current hierarchy; `review` — everything else.
   * Omitted applies no administrative constraint, which is the old behaviour.
   */
  administrativeState?: 'grouped' | 'review'
  sort?: PlaceSort
  direction?: 'asc' | 'desc'
  limit?: number
  cursor?: string | null
}

/** The filters that mean the same thing to the list and to the counts. */
export type PlaceCountFilters = Pick<
  PlaceListFilters,
  'status' | 'q' | 'areaKey' | 'category' | 'source' | 'staleDays'
> & { provinceCode?: string }

/**
 * ADM-018 — how many places sit under each current administrative unit.
 *
 * Without `provinceCode` this answers with provinces; with it, the communes of
 * that province. The counts are computed from the same predicates the list
 * uses, so every number here can be reached by a list query — which is what
 * makes it checkable rather than merely plausible.
 */
export function fetchPlaceAdministrativeCounts(
  filters: PlaceCountFilters,
  signal?: AbortSignal,
): Promise<PlaceAdministrativeCounts> {
  return apiFetchParsed(placeAdministrativeCountsSchema, '/cms/places/administrative-summary', {
    query: {
      provinceCode: filters.provinceCode,
      status: filters.status && filters.status !== 'all' ? filters.status : undefined,
      q: filters.q,
      areaKey: filters.areaKey,
      category: filters.category,
      source: filters.source && filters.source !== 'all' ? filters.source : undefined,
      staleDays: filters.staleDays,
    },
    signal,
  })
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
      provinceCode: filters.provinceCode,
      communeCode: filters.communeCode,
      administrativeState: filters.administrativeState,
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
  /**
   * ADR-0016 legacy free text. Not the administrative identity, and it selects
   * no code — `provinceCode`/`communeCode` are that.
   */
  city?: string | null
  /**
   * Legacy only: the district tier was dissolved on 2025-07-01. The console no
   * longer offers it, so this is only ever sent by something older.
   */
  district?: string | null
  /**
   * ADM-016 — the canonical administrative address, as codes.
   *
   * They travel as a pair: a province with no commune is not an address, and a
   * commune with no province has no hierarchy to be checked against. GoGo-BE
   * validates the pair against the dataset published at commit time, and the
   * codes enter its resolver as evidence — they are not an instruction, and
   * they verify nothing.
   */
  provinceCode?: string | null
  communeCode?: string | null
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

/**
 * GoGo-CMS#150 / GoGo-BE#452 — the third way a place enters the catalogue, and
 * the only one where the facts are the editor's own.
 *
 * Always answers a `draft`: publishing is `transitionPlace`, a separate
 * decision. A near-duplicate answers 409 `PLACE_DUPLICATE_SUSPECTED` with the
 * candidates in `field_errors`; resend with `allowDuplicate` once the editor
 * has looked at them.
 */
export type CreatePlaceInput = UpdatePlaceInput & {
  name: string
  lat: number
  lng: number
  allowDuplicate?: boolean
  /**
   * GoGo-CMS#157 — the Google record this place is the GoGo copy of, from a
   * preceding `resolvePlaceLink`. Identity, not content: it becomes a
   * `place_sources` row, which is what puts the place inside provider dedup.
   */
  googlePlaceId?: string
  /**
   * Which fields still hold what the resolution filled in. They are recorded
   * `google_derived` rather than `editorial`, so a later refresh knows which
   * values a person actually owns.
   */
  googleDerivedFields?: GoogleDerivedField[]
}

/** Exactly the fields GoGo-BE will accept as provider-applied. */
export const GOOGLE_DERIVED_FIELDS = ['name', 'addressText', 'lat', 'lng'] as const
export type GoogleDerivedField = (typeof GOOGLE_DERIVED_FIELDS)[number]

/**
 * GoGo-CMS#157 / GoGo-BE#465 — which Google place a link names.
 *
 * A preview. Nothing is written, and the editor sees the answer before any of
 * it reaches a form. Behind `place.write` and rate-limited per admin, because a
 * miss costs a provider request.
 *
 * Exactly one of `url` and `googlePlaceId`; the server rejects both and neither.
 */
export function resolvePlaceLink(input: {
  url?: string
  /**
   * The branch the editor picked out of a `CANDIDATE_SELECTION` (GoGo-BE#469).
   * Choosing is a resolution, so it takes the same route and answers the same
   * shape — including `ALREADY_EXISTS` when GoGo already holds that branch.
   */
  googlePlaceId?: string
  cityHint?: string
}) {
  return apiFetchParsed<typeof resolveLinkResultSchema>(
    resolveLinkResultSchema,
    '/cms/places/resolve-link',
    { method: 'POST', body: input },
  )
}

export type { ResolveLinkResult }

export function createPlace(input: CreatePlaceInput) {
  return apiFetch<CmsPlaceDetail>('/cms/places', {
    method: 'POST',
    body: input,
    idempotencyKey: newIdempotencyKey(),
  })
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

/*
 * Place media (GoGo-BE#191). Bytes never pass through these routes: the
 * browser asks `POST /cms/uploads` for a presigned PUT, sends the file
 * straight to storage, and hands only the key to `attachPlaceMedia`.
 */

/**
 * `cmsListAttachableMedia` — the caller's own unclaimed `place_image` keys,
 * plus what is already on this place. Never a consumer photo.
 */
export function fetchAttachableMedia(
  placeId: string,
  signal?: AbortSignal,
): Promise<AttachableMedia[]> {
  return apiFetchParsed(attachableMediaListSchema, `/cms/places/${placeId}/media/attachable`, {
    signal,
  }).then((page) => page.items)
}

export type AttachPlaceMediaInput = {
  storageKey: string
  caption?: string | null
  attribution?: string | null
  isCover?: boolean
  width?: number | null
  height?: number | null
}

/**
 * Attach an authorized key. Idempotency-keyed because the failure this retries
 * past is a lost 201, and replaying the attach unkeyed would come back
 * `409 PLACE_MEDIA_EXISTS` for work that in fact succeeded.
 */
export function attachPlaceMedia(
  placeId: string,
  input: AttachPlaceMediaInput,
): Promise<PlaceMedia> {
  return apiFetchParsed(placeMediaSchema, `/cms/places/${placeId}/media`, {
    method: 'POST',
    body: input,
    idempotencyKey: newIdempotencyKey(),
  })
}

/**
 * Reorder, caption, choose the cover, decide moderation.
 *
 * `moderationReason` is mandatory whenever `moderation` changes — the server
 * answers `400` with `field_errors[0].field === 'moderationReason'` otherwise,
 * and rejecting a photo clears `isCover` server-side.
 */
export type UpdatePlaceMediaInput = {
  sortOrder?: number
  moderation?: PlaceMediaModeration
  moderationReason?: string
  caption?: string | null
  attribution?: string | null
  isCover?: boolean
}

export function updatePlaceMedia(
  placeId: string,
  mediaId: string,
  patch: UpdatePlaceMediaInput,
): Promise<PlaceMedia> {
  return apiFetchParsed(placeMediaSchema, `/cms/places/${placeId}/media/${mediaId}`, {
    method: 'PATCH',
    body: patch,
  })
}

/** Detach is not delete: the row goes, the object in storage stays. */
export function detachPlaceMedia(placeId: string, mediaId: string) {
  return apiFetch(`/cms/places/${placeId}/media/${mediaId}`, { method: 'DELETE' })
}

/** References move to `id`; the duplicate is archived, never deleted. */
export function mergePlace(id: string, duplicateId: string) {
  return apiFetch(`/cms/places/${id}/merge`, {
    method: 'POST',
    body: { duplicateId },
    idempotencyKey: newIdempotencyKey(),
  })
}
