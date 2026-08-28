import { apiFetchParsed } from '@/shared/api/client'
import { auditPageSchema, type AuditPage } from '@/shared/api/contracts'

/**
 * Filters `GET /cms/audit` accepts. `resourceId` is text rather than a uuid:
 * feature flags and ranking configs are audited by key.
 */
export type AuditFilters = {
  resourceType?: string
  resourceId?: string
  actorId?: string
  action?: string
  from?: string
  to?: string
  /** The incident-review query: emergency takedowns, on their own. */
  breakGlass?: boolean
  limit?: number
  cursor?: string | null
}

/**
 * The log is read-only by design (FR-CMS-008) — GoGo-BE serves no write route
 * here and answers 404 to one even for super_admin, so this module has no
 * mutation to offer.
 */
export function fetchAudit(filters: AuditFilters, signal?: AbortSignal): Promise<AuditPage> {
  return apiFetchParsed(auditPageSchema, '/cms/audit', {
    query: {
      resourceType: filters.resourceType || undefined,
      resourceId: filters.resourceId || undefined,
      actorId: filters.actorId || undefined,
      action: filters.action || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      breakGlass: filters.breakGlass ? true : undefined,
      limit: filters.limit ?? 50,
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}
