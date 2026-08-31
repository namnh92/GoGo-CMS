import { useT } from '@/shared/i18n/i18n'
import { StatusBadge, type BadgeShape, type Tone } from '@/shared/ui/Badge'
import type { PrivacySla } from '@/shared/api/contracts'

/**
 * The SLA state as the **server** computed it from the stored due dates. The
 * console never recomputes the rule: a badge and a `sla=` filter that disagree
 * are worse than either alone.
 */
const TONE: Record<PrivacySla, Tone> = {
  ON_TRACK: 'mint',
  DUE_SOON: 'amber',
  OVERDUE: 'danger',
  COMPLETED: 'neutral',
}

const SHAPE: Record<PrivacySla, BadgeShape> = {
  ON_TRACK: 'check',
  DUE_SOON: 'clock',
  OVERDUE: 'alert',
  COMPLETED: 'info',
}

export function SlaBadge({ sla }: { sla: PrivacySla }) {
  const t = useT()
  return (
    <StatusBadge tone={TONE[sla]} shape={SHAPE[sla]} label={t(`privacy.sla.${sla}` as const)} />
  )
}
