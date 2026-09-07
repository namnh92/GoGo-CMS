import { useT } from '@/shared/i18n/i18n'
import { StatusBadge, type BadgeShape, type Tone } from '@/shared/ui/Badge'
import type { AdministrativeDatasetSummary } from '@/shared/api/contracts-administrative'

export type DatasetStatus = AdministrativeDatasetSummary['status']

/**
 * PUBLISHED is the only status that means "this is what the API is answering
 * from". ROLLED_BACK is not a failure: it is a version that *was* active and is
 * retained precisely so it can be again.
 */
const TONE: Record<DatasetStatus, Tone> = {
  STAGED: 'neutral',
  VALIDATED: 'lavender',
  REJECTED: 'danger',
  PUBLISHED: 'mint',
  ROLLED_BACK: 'neutral',
}

const SHAPE: Record<DatasetStatus, BadgeShape> = {
  STAGED: 'dot',
  VALIDATED: 'info',
  REJECTED: 'alert',
  PUBLISHED: 'check',
  ROLLED_BACK: 'clock',
}

export function DatasetStatusBadge({ status }: { status: DatasetStatus }) {
  const t = useT()
  return (
    <StatusBadge
      tone={TONE[status]}
      shape={SHAPE[status]}
      label={t(`administrative.status.${status}` as const)}
    />
  )
}

/** Severity of a validation finding. ERROR blocks; WARNING is recorded and does not. */
export function SeverityBadge({ severity }: { severity: 'ERROR' | 'WARNING' }) {
  const t = useT()
  return (
    <StatusBadge
      tone={severity === 'ERROR' ? 'danger' : 'amber'}
      shape="alert"
      label={t(`administrative.severity.${severity}` as const)}
    />
  )
}
