import { apiFetch, apiFetchParsed, newIdempotencyKey } from '@/shared/api/client'
import { moderationQueueSchema, type ModerationQueue } from '@/shared/api/contracts'

export type ModerationDecision = 'published' | 'rejected' | 'approved' | 'actioned' | 'dismissed'
export type SubmissionDecision = 'approved' | 'rejected' | 'merged'

export function fetchModerationQueue(
  limit: number,
  signal?: AbortSignal,
): Promise<ModerationQueue> {
  return apiFetchParsed(moderationQueueSchema, '/cms/moderation', { query: { limit }, signal })
}

/** The reason is mandatory (3–500 chars) and lands in the audit log. */
export function decideReview(id: string, decision: ModerationDecision, reason: string) {
  return apiFetch(`/cms/moderation/reviews/${id}`, {
    method: 'POST',
    body: { decision, reason },
    idempotencyKey: newIdempotencyKey(),
  })
}

export function decideReport(id: string, decision: ModerationDecision, reason: string) {
  return apiFetch(`/cms/moderation/reports/${id}`, {
    method: 'POST',
    body: { decision, reason },
    idempotencyKey: newIdempotencyKey(),
  })
}

export function decideCheckin(id: string, decision: ModerationDecision, reason: string) {
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
