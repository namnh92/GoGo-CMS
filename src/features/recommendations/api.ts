import { apiFetch, apiFetchParsed } from '@/shared/api/client'
import {
  cmsRecommendationDetailSchema,
  cmsRecommendationPageSchema,
  type CmsRecommendationDetail,
  type CmsRecommendationPage,
  type ContentAudience,
  type RecommendationStatus,
} from '@/shared/api/contracts'

/** Every parameter `GET /cms/recommendations` accepts (GoGo-BE#222). */
export type RecommendationFilters = {
  status?: RecommendationStatus
  audience?: ContentAudience
  areaKey?: string
  /** Substring of internal name, title or key. */
  q?: string
  limit?: number
  cursor?: string | null
}

export function fetchRecommendations(
  filters: RecommendationFilters,
  signal?: AbortSignal,
): Promise<CmsRecommendationPage> {
  return apiFetchParsed(cmsRecommendationPageSchema, '/cms/recommendations', {
    query: {
      status: filters.status,
      audience: filters.audience,
      areaKey: filters.areaKey,
      q: filters.q || undefined,
      limit: filters.limit ?? 25,
      // Keyset, not `priority`: priority is editable, so a row whose priority
      // changed mid-traversal would jump pages.
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

export function fetchRecommendation(
  id: string,
  signal?: AbortSignal,
): Promise<CmsRecommendationDetail> {
  return apiFetchParsed(cmsRecommendationDetailSchema, `/cms/recommendations/${id}`, { signal })
}

/** Exactly the fields `CmsRecommendationCreate` declares. */
export type CreateRecommendationInput = {
  slug: string
  internalName: string
  title: string
  audience: ContentAudience
  subtitle?: string
  description?: string
  locale?: string
  areaKey?: string
  priority?: number
  startsAt?: string
  endsAt?: string
  taxonomyIds?: string[]
  /** Ordered — the index becomes the stored position. */
  placeIds?: string[]
}

export function createRecommendation(
  input: CreateRecommendationInput,
): Promise<CmsRecommendationDetail> {
  return apiFetchParsed(cmsRecommendationDetailSchema, '/cms/recommendations', {
    method: 'POST',
    body: input,
  })
}

/**
 * Omitted fields are left alone. A sent list replaces that list wholesale —
 * a partial reorder is not expressible, and pretending otherwise is how an
 * ordering silently loses a row.
 */
export type UpdateRecommendationInput = Partial<Omit<CreateRecommendationInput, 'slug'>>

export function updateRecommendation(
  id: string,
  input: UpdateRecommendationInput,
): Promise<CmsRecommendationDetail> {
  return apiFetchParsed(cmsRecommendationDetailSchema, `/cms/recommendations/${id}`, {
    method: 'PATCH',
    body: input,
  })
}

/**
 * Declared transitions only. `archived` is terminal, scheduling needs a start
 * time, and publishing needs at least one place — the server refuses the rest
 * with `INVALID_STATUS_TRANSITION`, `SCHEDULE_REQUIRED` or `EMPTY_RECOMMENDATION`.
 */
export function setRecommendationStatus(id: string, status: RecommendationStatus) {
  return apiFetch(`/cms/recommendations/${id}/status`, { method: 'PATCH', body: { status } })
}

/** Replaces the ordered list; the array index becomes the stored position. */
export function setRecommendationPlaces(
  id: string,
  placeIds: string[],
): Promise<CmsRecommendationDetail> {
  return apiFetchParsed(cmsRecommendationDetailSchema, `/cms/recommendations/${id}/places`, {
    method: 'PUT',
    body: { placeIds },
  })
}
