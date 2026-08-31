import { useT } from '@/shared/i18n/i18n'
import { getAppEnvironment, type AppEnvironment } from '@/shared/config/env'
import { StatusBadge, type BadgeShape, type Tone } from './Badge'

/**
 * Which deployment am I about to run a destructive action against?
 *
 * A thin mapping over `StatusBadge` rather than a second badge primitive —
 * the only thing this owns is environment → tone/shape/label, and that mapping
 * would otherwise be repeated at every place the badge appears.
 */
const TONE: Record<AppEnvironment, Tone> = {
  dev: 'lavender',
  staging: 'amber',
  production: 'danger',
}

// Colour is never the sole signal: production and staging carry the warning
// glyph, dev the informational one, and the label spells the environment out.
const SHAPE: Record<AppEnvironment, BadgeShape> = {
  dev: 'info',
  staging: 'alert',
  production: 'alert',
}

export function EnvBadge({ environment }: { environment?: AppEnvironment }) {
  const t = useT()
  const value = environment ?? getAppEnvironment()
  return <StatusBadge tone={TONE[value]} shape={SHAPE[value]} label={t(`env.${value}` as const)} />
}
