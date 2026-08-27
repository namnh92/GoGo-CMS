import { apiFetch, apiFetchParsed, newIdempotencyKey } from '@/shared/api/client'
import { moderationQueueSchema, type ModerationQueue } from '@/shared/api/contracts'

/** Each queue accepts only its own pair; the controller casts per route. */
export type ReviewDecision = 'published' | 'rejected'
export type ReportDecision = 'actioned' | 'dismissed'
export type CheckinDecision = 'approved' | 'rejected'
export type SubmissionDecision = 'approved' | 'rejected' | 'merged'

export function fetchModerationQueue(
  limit: number,
  signal?: AbortSignal,
): Promise<ModerationQueue> {
  return apiFetchParsed(moderationQueueSchema, '/cms/moderation', { query: { limit }, signal })
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
