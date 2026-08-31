import { useT } from '@/shared/i18n/i18n'
import { StatusBadge, type BadgeShape, type Tone } from '@/shared/ui/Badge'
import type { RecommendationStatus } from '@/shared/api/contracts'

/** Tone and glyph paired, so the state survives greyscale. */
const TONE: Record<RecommendationStatus, Tone> = {
  draft: 'neutral',
  scheduled: 'lavender',
  published: 'mint',
  archived: 'amber',
}

const SHAPE: Record<RecommendationStatus, BadgeShape> = {
  draft: 'dot',
  scheduled: 'clock',
  published: 'check',
  archived: 'info',
}

export function RecommendationStatusBadge({ status }: { status: RecommendationStatus }) {
  const t = useT()
  return (
    <StatusBadge
      tone={TONE[status]}
      shape={SHAPE[status]}
      label={t(`recommendations.status.${status}` as const)}
    />
  )
}
