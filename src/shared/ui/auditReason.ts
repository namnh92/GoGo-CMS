import type { AuditEntry } from '@/shared/api/contracts'

/**
 * The operator's rationale for an audited write.
 *
 * The contract lifts `reason` out of the diff for the writes that require one;
 * a write whose reason the server has not lifted yet (`feature_flag.set` keeps
 * it in the diff, GoGo-BE#713 Q7) still carries it there. Either way the trail
 * shows it once, and a missing reason stays missing rather than blank.
 */
export function auditReason(entry: Pick<AuditEntry, 'reason' | 'diff'>): string | null {
  if (entry.reason) return entry.reason
  const diff = entry.diff
  if (typeof diff === 'object' && diff !== null && !Array.isArray(diff)) {
    const reason = (diff as Record<string, unknown>).reason
    if (typeof reason === 'string' && reason.trim().length > 0) return reason
  }
  return null
}
