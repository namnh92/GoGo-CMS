import { useT } from '@/shared/i18n/i18n'
import { StatusBadge, type BadgeShape, type Tone } from '@/shared/ui/Badge'
import type { CampaignStatus } from '@/shared/api/contracts'

/** Tone and glyph paired, so the state survives greyscale. */
const TONE: Record<CampaignStatus, Tone> = {
  draft: 'neutral',
  scheduled: 'lavender',
  sending: 'amber',
  sent: 'mint',
  cancelled: 'neutral',
  failed: 'danger',
}

const SHAPE: Record<CampaignStatus, BadgeShape> = {
  draft: 'dot',
  scheduled: 'clock',
  sending: 'clock',
  sent: 'check',
  cancelled: 'info',
  failed: 'alert',
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const t = useT()
  return (
    <StatusBadge
      tone={TONE[status]}
      shape={SHAPE[status]}
      label={t(`campaigns.status.${status}` as const)}
    />
  )
}
