import { apiFetchParsed } from '@/shared/api/client'
import {
  opsKpisSchema,
  searchAnalyticsSchema,
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
