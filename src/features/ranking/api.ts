import { apiFetch, apiFetchParsed, newIdempotencyKey } from '@/shared/api/client'
import {
  experimentListSchema,
  experimentSchema,
  featureFlagListSchema,
  rankingConfigListSchema,
  rankingEvaluationSchema,
  type RankingConfigStatus,
} from '@/shared/api/contracts'

export type RankingKey = 'suggestion.scoring' | 'search.ranking'

/** Each version carries who drafted and who approved it — that is what makes four-eyes checkable. */
export function fetchRankingConfigs(
  filters: { key?: RankingKey; status?: RankingConfigStatus } = {},
  signal?: AbortSignal,
) {
  return apiFetchParsed(rankingConfigListSchema, '/cms/ranking-configs', {
    query: { key: filters.key, status: filters.status },
    signal,
  })
}

export function fetchFeatureFlags(signal?: AbortSignal) {
  return apiFetchParsed(featureFlagListSchema, '/cms/feature-flags', { signal })
}

/**
 * Replays a candidate config against the snapshots stored with past suggestion
 * runs. Strictly offline: snapshots are read, scoring happens in memory,
 * nothing is written and no user sees any of it — which is what turns
 * activating a config into a decision instead of a hope.
 */
export function evaluateRankingConfig(id: string, sampleSize: number, signal?: AbortSignal) {
  return apiFetchParsed(rankingEvaluationSchema, `/cms/ranking-configs/${id}/evaluate`, {
    query: { sampleSize },
    signal,
  })
}

export function fetchExperiments(signal?: AbortSignal) {
  return apiFetchParsed(experimentListSchema, '/cms/experiments', { signal })
}

/**
 * Variant names are ranking config versions, and the server honours only an
 * **approved** version — an experiment must not become a side door for
 * unreviewed weights. Shares summing to less than 1 leave the remainder on
 * control; summing to more is refused rather than silently truncated.
 */
export function upsertExperiment(
  key: string,
  input: { enabled: boolean; variants: Record<string, number>; description?: string },
) {
  return apiFetchParsed(experimentSchema, `/cms/experiments/${key}`, {
    method: 'PUT',
    body: input,
  })
}

export function createRankingConfig(key: RankingKey, weights: Record<string, number>) {
  return apiFetch('/cms/ranking-configs', { method: 'POST', body: { key, weights } })
}

/** Four-eyes: the API rejects the creator with `SELF_APPROVAL`. */
export function approveRankingConfig(id: string) {
  return apiFetch(`/cms/ranking-configs/${id}/approve`, {
    method: 'POST',
    idempotencyKey: newIdempotencyKey(),
  })
}

export function activateRankingConfig(id: string) {
  return apiFetch(`/cms/ranking-configs/${id}/activate`, {
    method: 'POST',
    idempotencyKey: newIdempotencyKey(),
  })
}

export function rollbackRankingConfig(key: RankingKey) {
  return apiFetch(`/cms/ranking-configs/${key}/rollback`, {
    method: 'POST',
    idempotencyKey: newIdempotencyKey(),
  })
}

export function setFeatureFlag(key: string, enabled: boolean, payload?: unknown) {
  return apiFetch(`/cms/feature-flags/${key}`, {
    method: 'PUT',
    body: payload === undefined ? { enabled } : { enabled, payload },
  })
}
