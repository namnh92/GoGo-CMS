import { apiFetch, apiFetchParsed, newIdempotencyKey } from '@/shared/api/client'
import { featureFlagListSchema, rankingConfigListSchema } from '@/shared/api/contracts'

export type RankingKey = 'suggestion.scoring' | 'search.ranking'

/** ⚠ Not yet in openapi/gogo.v1.yaml (only the write side is). */
export function fetchRankingConfigs(signal?: AbortSignal) {
  return apiFetchParsed(rankingConfigListSchema, '/cms/ranking-configs', { signal })
}

/** ⚠ Not yet in openapi/gogo.v1.yaml (only `PUT /cms/feature-flags/{key}`). */
export function fetchFeatureFlags(signal?: AbortSignal) {
  return apiFetchParsed(featureFlagListSchema, '/cms/feature-flags', { signal })
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
