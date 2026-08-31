import { apiFetchParsed } from '@/shared/api/client'
import {
  cmsOpsCostsSchema,
  cmsOpsHealthSchema,
  cmsOpsQueuesSchema,
  opsKpisSchema,
  searchAnalyticsSchema,
  type CmsOpsCosts,
  type CmsOpsHealth,
  type CmsOpsQueues,
  type OpsKpis,
  type SearchAnalytics,
} from '@/shared/api/contracts'

export function fetchOpsKpis(signal?: AbortSignal): Promise<OpsKpis> {
  return apiFetchParsed(opsKpisSchema, '/cms/ops/kpis', { signal })
}

/**
 * `cmsSearchAnalytics` — zero-result rate with a denominator, which is the only
 * form in which the number means anything.
 *
 * Built from a daily aggregate rather than a request log, so there is nothing
 * to drill into: a daily counter carries no actor, and that is the privacy
 * design, not a gap. Terms below the visibility floor stay unnamed but are
 * still counted, so the totals do not understate how much of search fails.
 */
export function fetchSearchAnalytics(
  days: number,
  limit = 20,
  signal?: AbortSignal,
): Promise<SearchAnalytics> {
  return apiFetchParsed(searchAnalyticsSchema, '/cms/search-analytics', {
    query: { days, limit },
    signal,
  })
}

/**
 * BE-CMS-G8 (#247). Cached ~20s server-side — a screen, not an alerting path.
 * Provider rows come from the circuit breaker, so a provider with no traffic
 * yet is absent rather than green.
 */
export function fetchOpsHealth(signal?: AbortSignal): Promise<CmsOpsHealth> {
  return apiFetchParsed(cmsOpsHealthSchema, '/cms/ops/health', { signal })
}

/** BullMQ queues plus the Postgres outbox. An unreachable broker contributes no rows. */
export function fetchOpsQueues(signal?: AbortSignal): Promise<CmsOpsQueues> {
  return apiFetchParsed(cmsOpsQueuesSchema, '/cms/ops/queues', { signal })
}

/**
 * Only providers with a real source appear. `sourcesConfigured: false` with an
 * empty list means "nothing is connected", and the caller must not render it
 * as a zero amount.
 */
export function fetchOpsCosts(signal?: AbortSignal): Promise<CmsOpsCosts> {
  return apiFetchParsed(cmsOpsCostsSchema, '/cms/ops/costs', { signal })
}
