import { useT } from '@/shared/i18n/i18n'
import { StatusBadge, type BadgeShape, type Tone } from '@/shared/ui/Badge'
import type { PlanTemplateStatus } from '@/shared/api/contracts'

const TONE: Record<PlanTemplateStatus, Tone> = {
  draft: 'neutral',
  published: 'mint',
  archived: 'amber',
}

const SHAPE: Record<PlanTemplateStatus, BadgeShape> = {
  draft: 'dot',
  published: 'check',
  archived: 'info',
}

export function PlanTemplateStatusBadge({ status }: { status: PlanTemplateStatus }) {
  const t = useT()
  return (
    <StatusBadge
      tone={TONE[status]}
      shape={SHAPE[status]}
      label={t(`planTemplates.status.${status}` as const)}
    />
  )
}
