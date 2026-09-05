import { apiFetch, apiFetchParsed } from '@/shared/api/client'
import type { RequestBody } from '@/shared/api/generated'
import {
  cmsCostOverviewSchema,
  cmsCostServiceDetailEnvelopeSchema,
  cmsCostTestRunEnvelopeSchema,
  cmsCostTestRunsSchema,
  cmsManualCostItemEnvelopeSchema,
  cmsManualCostItemsSchema,
  opsProviderDetailSchema,
  opsProvidersSchema,
  opsSummarySchema,
  type OpsProviderDetail,
  type OpsProviders,
  type OpsSummary,
  type OpsWindow,
  cmsOpsHealthSchema,
  cmsOpsQueuesSchema,
  opsKpisSchema,
  searchAnalyticsSchema,
  type CmsCostOverview,
  type CmsCostServiceDetailEnvelope,
  type CmsCostTestRunDetail,
  type CmsCostTestRuns,
  type CmsCostWindow,
  type CmsManualCostItem,
  type CmsManualCostItems,
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
 * BE-CMS-P2 (GoGo-BE#315) — provider monitoring, from the time-series store.
 *
 * The console holds no Grafana credential and no metrics token, and sends no
 * PromQL: `window` is one of four values and GoGo-BE owns every query. It also
 * never calls `/v1/metrics` — that endpoint is a machine surface behind a
 * shared token with no per-user authorization, and a browser is the wrong
 * place for it.
 *
 * `backend.status` is part of the payload rather than the HTTP status on
 * purpose: monitoring being down is a fact about monitoring, and a 5xx here
 * would render as "the CMS is broken".
 */
export function fetchOpsSummary(window: OpsWindow, signal?: AbortSignal): Promise<OpsSummary> {
  return apiFetchParsed(opsSummarySchema, '/cms/ops/summary', { query: { window }, signal })
}

export function fetchOpsProviders(window: OpsWindow, signal?: AbortSignal): Promise<OpsProviders> {
  return apiFetchParsed(opsProvidersSchema, '/cms/ops/providers', { query: { window }, signal })
}

export function fetchOpsProvider(
  provider: 'places' | 'routes' | 'sheets',
  window: OpsWindow,
  signal?: AbortSignal,
): Promise<OpsProviderDetail> {
  return apiFetchParsed(opsProviderDetailSchema, `/cms/ops/providers/${provider}`, {
    query: { window },
    signal,
  })
}

/**
 * COST-CMS-010 (GoGo-BE#382) — manual / fixed cost items.
 *
 * The list carries `eligibleServices`: the registry's services that declare
 * `MANUAL_COST`, which is the form's provider/service picker. A new manual
 * provider on the server appears here with no CMS change.
 */
export function fetchManualCostItems(signal?: AbortSignal): Promise<CmsManualCostItems> {
  return apiFetchParsed(cmsManualCostItemsSchema, '/cms/ops/costs/manual-items', { signal })
}

/** Exactly the body `cmsOpsCreateManualCostItem` declares — micros per period. */
export type ManualCostItemInput = RequestBody<'cmsOpsCreateManualCostItem'>
/** Omitted fields are left alone; `null` clears `effectiveTo` / `note`. */
export type ManualCostItemPatch = RequestBody<'cmsOpsUpdateManualCostItem'>

/**
 * Retryable: the key makes a repeat return the item that was created rather
 * than a second one — the server rebuilds MANUAL rows on every create, and a
 * duplicated subscription would double the month.
 */
export async function createManualCostItem(
  input: ManualCostItemInput,
  idempotencyKey: string,
): Promise<CmsManualCostItem> {
  const { item } = await apiFetchParsed(
    cmsManualCostItemEnvelopeSchema,
    '/cms/ops/costs/manual-items',
    { method: 'POST', body: input, idempotencyKey },
  )
  return item
}

export async function updateManualCostItem(
  id: string,
  patch: ManualCostItemPatch,
): Promise<CmsManualCostItem> {
  const { item } = await apiFetchParsed(
    cmsManualCostItemEnvelopeSchema,
    `/cms/ops/costs/manual-items/${id}`,
    { method: 'PATCH', body: patch },
  )
  return item
}

/** Every MANUAL row derived from the item is gone before this resolves. */
export function deleteManualCostItem(id: string): Promise<{ deleted: true }> {
  return apiFetch(`/cms/ops/costs/manual-items/${id}`, { method: 'DELETE' })
}

/**
 * COST-CMS-009 (GoGo-BE#381) — the Cost Center overview.
 *
 * One read answers the whole page: the §35 cards and one row per registry
 * provider with its services nested. There is no per-provider fan-out, and
 * nothing here may branch on a provider id — a provider added to the server's
 * registry arrives as another row.
 *
 * Refreshing this screen calls no paid provider. Every figure comes from
 * GoGo-BE's own daily tables, which is also why the console needs no Grafana
 * credential and sends no PromQL: it reads `/v1/cms/ops/*` and nothing else.
 *
 * The response also carries the deprecated #335 keys for the dashboard card;
 * they are a different shape parsed by `cmsOpsCostsSchema`, and this schema
 * drops them.
 */
export function fetchCostOverview(
  window: CmsCostWindow,
  signal?: AbortSignal,
): Promise<CmsCostOverview> {
  return apiFetchParsed(cmsCostOverviewSchema, '/cms/ops/costs', { query: { window }, signal })
}

/**
 * One service with `operations[]` — every registry operation and its meters,
 * plus any operation label the tables carry that the registry does not know
 * (`unregistered`), so a billed call never vanishes because somebody forgot
 * to fold a SKU.
 *
 * Ids are registry ids rather than an enum, so they are encoded rather than
 * validated against a list here: an unknown id is the server's 404 to give.
 */
export function fetchCostService(
  providerId: string,
  serviceId: string,
  window: CmsCostWindow,
  signal?: AbortSignal,
): Promise<CmsCostServiceDetailEnvelope> {
  return apiFetchParsed(
    cmsCostServiceDetailEnvelopeSchema,
    `/cms/ops/costs/providers/${encodeURIComponent(providerId)}/services/${encodeURIComponent(serviceId)}`,
    { query: { window }, signal },
  )
}

/** Test-run cost records, newest first (epic §28, GoGo-BE#378). */
export function fetchCostTestRuns(limit = 20, signal?: AbortSignal): Promise<CmsCostTestRuns> {
  return apiFetchParsed(cmsCostTestRunsSchema, '/cms/ops/costs/test-runs', {
    query: { limit },
    signal,
  })
}

/**
 * One run with its per-meter deltas. A run still `running` carries its
 * baseline snapshot at delta 0 and null totals — nothing has been measured,
 * and a floor of 0 would read as a result.
 */
export async function fetchCostTestRun(
  id: string,
  signal?: AbortSignal,
): Promise<CmsCostTestRunDetail> {
  const { testRun } = await apiFetchParsed(
    cmsCostTestRunEnvelopeSchema,
    `/cms/ops/costs/test-runs/${encodeURIComponent(id)}`,
    { signal },
  )
  return testRun
}
