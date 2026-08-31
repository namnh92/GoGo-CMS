import { useT } from '@/shared/i18n/i18n'
import { StatusBadge, type BadgeShape, type Tone } from '@/shared/ui/Badge'
import type { BannerEffectiveStatus } from '@/shared/api/contracts'

/**
 * The **effective** status, which is what a reader needs: `expired` is
 * computed by the server from the end time on every read, so a banner whose
 * window has closed says so even though nobody set it.
 */
const TONE: Record<BannerEffectiveStatus, Tone> = {
  draft: 'neutral',
  scheduled: 'lavender',
  published: 'mint',
  archived: 'neutral',
  expired: 'amber',
}

const SHAPE: Record<BannerEffectiveStatus, BadgeShape> = {
  draft: 'dot',
  scheduled: 'clock',
  published: 'check',
  archived: 'info',
  expired: 'alert',
}

export function BannerStatusBadge({ status }: { status: BannerEffectiveStatus }) {
  const t = useT()
  return (
    <StatusBadge
      tone={TONE[status]}
      shape={SHAPE[status]}
      label={t(`banners.status.${status}` as const)}
    />
  )
}
