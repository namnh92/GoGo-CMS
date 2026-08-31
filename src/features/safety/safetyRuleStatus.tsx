import { useT } from '@/shared/i18n/i18n'
import { StatusBadge, type BadgeShape, type Tone } from '@/shared/ui/Badge'
import type { SafetyRuleSeverity, SafetyRuleStatus } from '@/shared/api/contracts'

/** Tone and glyph paired, so the state survives greyscale. */
const STATUS_TONE: Record<SafetyRuleStatus, Tone> = {
  draft: 'neutral',
  active: 'mint',
  disabled: 'amber',
}

const STATUS_SHAPE: Record<SafetyRuleStatus, BadgeShape> = {
  draft: 'dot',
  active: 'check',
  disabled: 'info',
}

export function SafetyRuleStatusBadge({ status }: { status: SafetyRuleStatus }) {
  const t = useT()
  return (
    <StatusBadge
      tone={STATUS_TONE[status]}
      shape={STATUS_SHAPE[status]}
      label={t(`safety.status.${status}` as const)}
    />
  )
}

/**
 * Severity is an ordered scale, so it reads as one: the glyph escalates with
 * the tone rather than repeating it, and the label carries the level in words
 * for anyone who cannot separate amber from coral.
 */
const SEVERITY_TONE: Record<SafetyRuleSeverity, Tone> = {
  low: 'neutral',
  medium: 'lavender',
  high: 'amber',
  critical: 'danger',
}

const SEVERITY_SHAPE: Record<SafetyRuleSeverity, BadgeShape> = {
  low: 'dot',
  medium: 'info',
  high: 'alert',
  critical: 'alert',
}

export function SafetyRuleSeverityBadge({ severity }: { severity: SafetyRuleSeverity }) {
  const t = useT()
  return (
    <StatusBadge
      tone={SEVERITY_TONE[severity]}
      shape={SEVERITY_SHAPE[severity]}
      label={t(`safety.severity.${severity}` as const)}
    />
  )
}
