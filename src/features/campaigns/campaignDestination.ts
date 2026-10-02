import { ApiError } from '@/shared/api/errors'
import type { CampaignDestination } from '@/shared/api/contracts'

/**
 * GoGo-BE#604, option (c) — destinations the app cannot open yet.
 *
 * The contract still lists all six (the enum is unchanged on purpose), but the
 * app has a screen for `place` and a tab for `saved` only. A push pointing at
 * any of these three lands the recipient on Home with nothing to say why, so
 * the console offers them as visibly unavailable rather than as a working
 * choice, and GoGo-BE refuses them with `422 INVALID_DESTINATION`.
 *
 * Kept as a list rather than derived from anything: the day the app can open
 * one of these, it is removed from here in the same change that ships the
 * screen.
 */
export const UNOPENABLE_DESTINATIONS: readonly CampaignDestination[] = [
  'recommendation',
  'plan_template',
  'external_url',
]

export function isOpenableDestination(type: CampaignDestination): boolean {
  return !UNOPENABLE_DESTINATIONS.includes(type)
}

/**
 * The server's refusal of a destination the app cannot open. Mapped to the
 * destination field so an out-of-order deploy (BE refusing something this
 * console still offers) reads as a field problem, not a generic failure.
 */
export function isInvalidDestinationError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 422 && error.code === 'INVALID_DESTINATION'
}
