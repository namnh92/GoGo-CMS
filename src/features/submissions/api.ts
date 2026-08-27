import { apiFetch, apiFetchParsed, newIdempotencyKey } from '@/shared/api/client'
import { placeSubmissionListSchema, type PlaceSubmissionList } from '@/shared/api/contracts'

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'merged'
export type SubmissionDecision = 'approved' | 'rejected' | 'merged'

/**
 * PI-CMS-007. Keyset paging, newest first — proposals keep arriving while a
 * moderator works through the queue, so a page number would repeat or skip.
 */
export function fetchSubmissions(
  params: { status: SubmissionStatus; limit?: number; cursor?: string },
  signal?: AbortSignal,
): Promise<PlaceSubmissionList> {
  return apiFetchParsed(placeSubmissionListSchema, '/cms/place-submissions', {
    query: {
      status: params.status,
      limit: params.limit ?? 25,
      ...(params.cursor ? { cursor: params.cursor } : {}),
    },
    signal,
  })
}

/**
 * `mergeIntoPlaceId` is required by the server for a merge and meaningless
 * otherwise, so it is only sent for that decision.
 */
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
