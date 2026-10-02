import type { PlaceProviderStatus } from '@/shared/api/contracts'
import { StatusBadge, type BadgeShape, type Tone } from '@/shared/ui/Badge'
import { formatDay } from '@/shared/format'
import { useI18n } from '@/shared/i18n/i18n'

type KnownStatus = 'active' | 'closed' | 'temporarily_closed' | 'moved' | 'unknown'

/** Every tone carries a glyph, so the state survives greyscale. */
const LOOK: Record<KnownStatus, { tone: Tone; shape: BadgeShape }> = {
  active: { tone: 'mint', shape: 'check' },
  closed: { tone: 'danger', shape: 'alert' },
  temporarily_closed: { tone: 'amber', shape: 'clock' },
  moved: { tone: 'amber', shape: 'info' },
  unknown: { tone: 'neutral', shape: 'dot' },
}

function isKnown(status: string): status is KnownStatus {
  return Object.prototype.hasOwnProperty.call(LOOK, status)
}

/**
 * GoGo-BE#360 — what the provider last reported about the business, with the
 * day it was read. The source is named in words (core rule 14), and it is
 * kept apart from GoGo's own moderation `status`. `status` is an extensible
 * enum: a value the CMS does not know yet is named as-is in neutral, never
 * mapped onto a known meaning. Renders nothing when no provider has reported.
 */
export function PlaceProviderStatusBadge({
  providerStatus,
}: {
  providerStatus: PlaceProviderStatus | null | undefined
}) {
  const { t, locale } = useI18n()
  if (!providerStatus) return null
  const { status, fetchedAt } = providerStatus
  const known = isKnown(status)
  const look = known ? LOOK[status] : { tone: 'neutral' as const, shape: 'info' as const }
  const label = known
    ? t(`placeEditor.providerStatus.${status}` as const)
    : t('placeEditor.providerStatus.other', { value: status })
  return (
    <div className="flex">
      <StatusBadge
        tone={look.tone}
        shape={look.shape}
        label={t('placeEditor.providerStatus.line', {
          status: label,
          date: formatDay(fetchedAt, locale),
        })}
      />
    </div>
  )
}
