import { z } from 'zod'
import { apiFetch, newIdempotencyKey } from '@/shared/api/client'

/**
 * SEC-001 break-glass. Three separate routes on purpose: their own rate limit,
 * their own audit actions, their own metric, and no bulk form to abuse.
 *
 * Taking content DOWN is open to every active admin because it is reversible
 * and reduces harm. Putting it back up is not here — restore keeps its usual
 * privileged role and goes through the ordinary screens.
 */
export type TakedownTarget = 'place' | 'review' | 'checkin'

/** The server rejects anything shorter; this record is the only explanation. */
export const MIN_TAKEDOWN_REASON = 10
export const MAX_TAKEDOWN_REASON = 500

export const takedownReasonSchema = z
  .string()
  .trim()
  .min(MIN_TAKEDOWN_REASON)
  .max(MAX_TAKEDOWN_REASON)

const PATHS: Record<TakedownTarget, (id: string) => string> = {
  place: (id) => `/cms/emergency/places/${id}/suspend`,
  review: (id) => `/cms/emergency/reviews/${id}/hide`,
  checkin: (id) => `/cms/emergency/checkins/${id}/hide`,
}

export function takedown(target: TakedownTarget, id: string, reason: string) {
  return apiFetch(PATHS[target](id), {
    method: 'POST',
    body: { reason },
    idempotencyKey: newIdempotencyKey(),
  })
}

/**
 * The one transition each route accepts. Anything else is refused with
 * `409 NOT_TAKEDOWNABLE` rather than coerced, so the UI disables the action
 * instead of letting an operator discover it mid-incident.
 */
export const TAKEDOWN_TRANSITION: Record<TakedownTarget, { from: string; to: string }> = {
  place: { from: 'published', to: 'suspended' },
  review: { from: 'published', to: 'hidden' },
  checkin: { from: 'pending | approved', to: 'hidden' },
}
