import { useLabel } from '@/shared/i18n/i18n'
import type { CmsAssistantActor } from '@/shared/api/contracts-assistant'

/** Staff identity as the API gives it: the display name, else the role. */
export function useActorName(): (actor: CmsAssistantActor | null | undefined) => string {
  const label = useLabel()
  return (actor) => {
    if (!actor) return '—'
    return actor.displayName || label(`role.${actor.role}`, actor.role)
  }
}
