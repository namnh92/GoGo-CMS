import { useT } from '@/shared/i18n/i18n'
import { StatusBadge, type BadgeShape, type Tone } from '@/shared/ui/Badge'
import type { AppUserStatus } from '@/shared/api/contracts'

/**
 * Suspended and banned are different values because the question they answer
 * — is this account expected back? — is different; they never merge into one
 * badge. Tone and glyph paired so the state survives greyscale.
 */
const TONE: Record<AppUserStatus, Tone> = {
  active: 'mint',
  suspended: 'amber',
  banned: 'danger',
  deleted: 'neutral',
}

const SHAPE: Record<AppUserStatus, BadgeShape> = {
  active: 'check',
  suspended: 'clock',
  banned: 'alert',
  deleted: 'info',
}

export function AppUserStatusBadge({ status }: { status: AppUserStatus }) {
  const t = useT()
  return (
    <StatusBadge
      tone={TONE[status]}
      shape={SHAPE[status]}
      label={t(`users.status.${status}` as const)}
    />
  )
}
