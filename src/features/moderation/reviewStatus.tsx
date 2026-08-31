import { useT } from '@/shared/i18n/i18n'
import { StatusBadge, type BadgeShape, type Tone } from '@/shared/ui/Badge'
import type { ReviewModerationStatus } from '@/shared/api/contracts'

/**
 * The five states `GET /cms/moderation/reviews` can return. Tone and glyph are
 * paired, so the state survives greyscale — `rejected` and `hidden` are both
 * "not visible" but for different reasons, and the label is what tells them
 * apart.
 */
const TONE: Record<ReviewModerationStatus, Tone> = {
  pending: 'amber',
  published: 'mint',
  rejected: 'danger',
  removed: 'danger',
  hidden: 'neutral',
}

const SHAPE: Record<ReviewModerationStatus, BadgeShape> = {
  pending: 'clock',
  published: 'check',
  rejected: 'alert',
  removed: 'alert',
  hidden: 'dot',
}

export function ReviewStatusBadge({ status }: { status: ReviewModerationStatus }) {
  const t = useT()
  return (
    <StatusBadge
      tone={TONE[status]}
      shape={SHAPE[status]}
      label={t(`reviews.status.${status}` as const)}
    />
  )
}
