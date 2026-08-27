import type { ImportJobStatus, ImportRowStatus } from '@/shared/api/contracts-import'
import { StatusBadge, type Tone } from '@/shared/ui/Badge'
import { useT } from '@/shared/i18n/i18n'

type Shape = 'dot' | 'check' | 'alert' | 'clock' | 'info'

const JOB_TONE: Record<ImportJobStatus, Tone> = {
  uploaded: 'neutral',
  validating: 'lavender',
  processing: 'lavender',
  review_required: 'amber',
  completed: 'mint',
  partial_success: 'amber',
  failed: 'danger',
  cancelled: 'neutral',
  // Quota exhaustion is an interruption, never a data error.
  paused_provider_quota: 'amber',
}

const JOB_SHAPE: Record<ImportJobStatus, Shape> = {
  uploaded: 'dot',
  validating: 'clock',
  processing: 'clock',
  review_required: 'alert',
  completed: 'check',
  partial_success: 'alert',
  failed: 'alert',
  cancelled: 'dot',
  paused_provider_quota: 'info',
}

export function JobStatusBadge({ status }: { status: ImportJobStatus }) {
  const t = useT()
  return (
    <StatusBadge
      tone={JOB_TONE[status]}
      shape={JOB_SHAPE[status]}
      label={t(`importStatus.${status}` as const)}
    />
  )
}

const ROW_TONE: Record<ImportRowStatus, Tone> = {
  pending: 'neutral',
  validation_failed: 'danger',
  resolving: 'lavender',
  unresolved: 'danger',
  needs_confirmation: 'amber',
  duplicate: 'amber',
  ready: 'mint',
  imported: 'mint',
  failed: 'danger',
}

const ROW_SHAPE: Record<ImportRowStatus, Shape> = {
  pending: 'dot',
  validation_failed: 'alert',
  resolving: 'clock',
  unresolved: 'alert',
  needs_confirmation: 'info',
  duplicate: 'info',
  ready: 'check',
  imported: 'check',
  failed: 'alert',
}

export function RowStatusBadge({ status }: { status: ImportRowStatus }) {
  const t = useT()
  return (
    <StatusBadge
      tone={ROW_TONE[status]}
      shape={ROW_SHAPE[status]}
      label={t(`rowStatus.${status}` as const)}
    />
  )
}

export const ROW_STATUSES: ImportRowStatus[] = [
  'pending',
  'validation_failed',
  'resolving',
  'unresolved',
  'needs_confirmation',
  'duplicate',
  'ready',
  'imported',
  'failed',
]
