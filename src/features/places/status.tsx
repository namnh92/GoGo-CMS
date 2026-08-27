import type { PlaceStatus } from '@/shared/api/contracts'
import { StatusBadge, type Tone } from '@/shared/ui/Badge'
import { useT } from '@/shared/i18n/i18n'

const TONE: Record<PlaceStatus, Tone> = {
  draft: 'neutral',
  community_submitted: 'lavender',
  review: 'amber',
  published: 'mint',
  suspended: 'danger',
  archived: 'neutral',
}

const SHAPE: Record<PlaceStatus, 'dot' | 'check' | 'alert' | 'clock' | 'info'> = {
  draft: 'dot',
  community_submitted: 'info',
  review: 'clock',
  published: 'check',
  suspended: 'alert',
  archived: 'dot',
}

/** Workflow order the API accepts: draft → review → published → suspended. */
export const PLACE_STATUSES: PlaceStatus[] = [
  'draft',
  'community_submitted',
  'review',
  'published',
  'suspended',
  'archived',
]

export function PlaceStatusBadge({ status }: { status: PlaceStatus }) {
  const t = useT()
  return (
    <StatusBadge
      tone={TONE[status]}
      shape={SHAPE[status]}
      label={t(`placeStatus.${status}` as const)}
    />
  )
}
