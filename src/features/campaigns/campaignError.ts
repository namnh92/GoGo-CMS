/**
 * NTF-CMS-001 (#191) — the reason a dispatch ended with nothing delivered.
 *
 * GoGo-BE#516 writes `last_error` as `CODE: english detail`. The code is the
 * part a reader needs and the part we can translate; the detail behind it is
 * for a log. An unknown code falls through unchanged rather than being
 * swallowed — a message we cannot name is still information, and hiding it
 * would leave an operator with a red box and no text.
 */
const CAMPAIGN_ERROR_KEYS = {
  NO_SUBSCRIPTION_ACCEPTED: 'campaigns.error.noSubscriptionAccepted',
  EMPTY_AUDIENCE: 'campaigns.error.emptyAudience',
} as const

export function campaignErrorMessage(
  lastError: string,
  t: (key: never) => string,
): string {
  const code = lastError.split(':', 1)[0]?.trim() as keyof typeof CAMPAIGN_ERROR_KEYS | undefined
  const key = code ? CAMPAIGN_ERROR_KEYS[code] : undefined
  return key ? t(key as never) : lastError
}
