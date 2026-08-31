import { apiFetch, apiFetchParsed, newIdempotencyKey } from '@/shared/api/client'
import {
  cmsCommunityPlacePageSchema,
  cmsModerationCheckinPageSchema,
  cmsModerationCountsSchema,
  cmsModerationReportPageSchema,
  cmsModerationReviewPageSchema,
  type CheckinModerationStatus,
  type CmsCommunityPlacePage,
  type CmsModerationCheckinPage,
  type CmsModerationCounts,
  type CmsModerationReportPage,
  type CmsModerationReviewPage,
  type ReportStatus,
  type ReportTargetType,
  type ReviewModerationStatus,
} from '@/shared/api/contracts'
import { fetchAudit } from '@/features/audit/api'
import type { AuditPage } from '@/shared/api/contracts'

/** Each queue accepts only its own pair; the controller casts per route. */
export type ReviewDecision = 'published' | 'rejected'
export type ReportDecision = 'actioned' | 'dismissed'
export type CheckinDecision = 'approved' | 'rejected'
export type SubmissionDecision = 'approved' | 'rejected' | 'merged'

/**
 * Every parameter `GET /cms/moderation/reviews` accepts (GoGo-BE#219).
 *
 * `status` defaults to `pending` on the server — the work queue — so it is
 * only sent when the operator picks something else.
 */
export type ReviewQueueFilters = {
  status?: ReviewModerationStatus
  rating?: number
  reported?: boolean
  placeId?: string
  userId?: string
  dateFrom?: string
  /** Exclusive, so consecutive day filters tile without double-counting. */
  dateTo?: string
  limit?: number
  cursor?: string | null
}

export function fetchModerationReviews(
  filters: ReviewQueueFilters,
  signal?: AbortSignal,
): Promise<CmsModerationReviewPage> {
  return apiFetchParsed(cmsModerationReviewPageSchema, '/cms/moderation/reviews', {
    query: {
      status: filters.status,
      rating: filters.rating,
      // `false` is a real filter ("no open report"), so only `undefined` drops.
      reported: filters.reported === undefined ? undefined : filters.reported,
      placeId: filters.placeId,
      userId: filters.userId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      limit: filters.limit ?? 25,
      // Keyset, not offset: users write to this queue while it is being read.
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

/**
 * `GET /cms/moderation/counts` — the number behind the sidebar badge.
 *
 * Counted in the database over the whole backlog, so it does not change with
 * the page size the console happens to ask for. Summing the unified queue's
 * four arrays was only ever correct while every queue fitted in one page, and
 * the review backlog no longer does.
 */
export function fetchModerationCounts(signal?: AbortSignal): Promise<CmsModerationCounts> {
  return apiFetchParsed(cmsModerationCountsSchema, '/cms/moderation/counts', { signal })
}

/** The reason is mandatory (3–500 chars) and lands in the audit log. */
export function decideReview(id: string, decision: ReviewDecision, reason: string) {
  return apiFetch(`/cms/moderation/reviews/${id}`, {
    method: 'POST',
    body: { decision, reason },
    idempotencyKey: newIdempotencyKey(),
  })
}

export function decideReport(id: string, decision: ReportDecision, reason: string) {
  return apiFetch(`/cms/moderation/reports/${id}`, {
    method: 'POST',
    body: { decision, reason },
    idempotencyKey: newIdempotencyKey(),
  })
}

export function decideCheckin(id: string, decision: CheckinDecision, reason: string) {
  return apiFetch(`/cms/moderation/checkins/${id}`, {
    method: 'POST',
    body: { decision, reason },
    idempotencyKey: newIdempotencyKey(),
  })
}

export function decideSubmission(
  id: string,
  decision: SubmissionDecision,
  reason: string,
  mergeIntoPlaceId?: string,
) {
  return apiFetch(`/cms/place-submissions/${id}/decide`, {
    method: 'POST',
    body: {
      decision,
      reason,
      ...(decision === 'merged' && mergeIntoPlaceId ? { mergeIntoPlaceId } : {}),
    },
    idempotencyKey: newIdempotencyKey(),
  })
}

/**
 * What has already been decided about one review.
 *
 * Filtered by `resourceId` alone, deliberately. `resourceType` is a free-form
 * string in the contract (`CmsAuditEntry.resourceType` has no enum), so
 * guessing the token this server writes for a review would be inventing a
 * value; the id is unambiguous on its own. Reuses `GET /cms/audit` rather than
 * adding a second audit reader.
 */
export function fetchReviewHistory(reviewId: string, signal?: AbortSignal): Promise<AuditPage> {
  return fetchAudit({ resourceId: reviewId, limit: 20 }, signal)
}

/** Shared paging shape for every per-type queue. */
type Paging = { limit?: number; cursor?: string | null }

export type ReportQueueFilters = Paging & {
  /** Defaults to `open` on the server — the work queue. */
  status?: ReportStatus
  targetType?: ReportTargetType
  targetId?: string
  reasonCode?: string
  dateFrom?: string
  dateTo?: string
}

export function fetchModerationReports(
  filters: ReportQueueFilters,
  signal?: AbortSignal,
): Promise<CmsModerationReportPage> {
  return apiFetchParsed(cmsModerationReportPageSchema, '/cms/moderation/reports', {
    query: {
      status: filters.status,
      targetType: filters.targetType,
      targetId: filters.targetId,
      reasonCode: filters.reasonCode,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      limit: filters.limit ?? 25,
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

export type CheckinQueueFilters = Paging & {
  /** Defaults to `pending` on the server. */
  status?: CheckinModerationStatus
  rating?: number
  hasBill?: boolean
  placeId?: string
  dateFrom?: string
  dateTo?: string
}

export function fetchModerationCheckins(
  filters: CheckinQueueFilters,
  signal?: AbortSignal,
): Promise<CmsModerationCheckinPage> {
  return apiFetchParsed(cmsModerationCheckinPageSchema, '/cms/moderation/checkins', {
    query: {
      status: filters.status,
      rating: filters.rating,
      // `false` is a real filter ("no bill"), so only `undefined` drops.
      hasBill: filters.hasBill === undefined ? undefined : filters.hasBill,
      placeId: filters.placeId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      limit: filters.limit ?? 25,
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

export type CommunityPlaceFilters = Paging & {
  /** Accent-insensitive name search, same normalization as consumer search. */
  q?: string
  areaKey?: string
  dateFrom?: string
  dateTo?: string
}

export function fetchCommunityPlaces(
  filters: CommunityPlaceFilters,
  signal?: AbortSignal,
): Promise<CmsCommunityPlacePage> {
  return apiFetchParsed(cmsCommunityPlacePageSchema, '/cms/moderation/community-places', {
    query: {
      q: filters.q || undefined,
      areaKey: filters.areaKey,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      limit: filters.limit ?? 25,
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}
