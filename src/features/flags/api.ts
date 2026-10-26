import { z } from 'zod'
import { apiFetch, apiFetchParsed } from '@/shared/api/client'
import {
  featureFlagCatalogSchema,
  featureFlagListSchema,
  type FeatureFlag,
  type FeatureFlagDefinition,
  type FlagEnvironment,
  type FlagPlatform,
} from '@/shared/api/contracts'

/**
 * The registry of keys something in the backend actually reads.
 *
 * This — not the override list — is what says which keys exist. A key is added
 * by shipping the code that reads it, so the console can never write a value
 * nothing consumes.
 */
export function fetchFlagCatalog(signal?: AbortSignal): Promise<FeatureFlagDefinition[]> {
  return apiFetchParsed(featureFlagCatalogSchema, '/cms/feature-flags/catalog', { signal })
}

/** Stored overrides, optionally narrowed to one environment and platform. */
export function fetchFlagOverrides(
  scope: { environment?: FlagEnvironment; platform?: FlagPlatform },
  signal?: AbortSignal,
): Promise<FeatureFlag[]> {
  return apiFetchParsed(featureFlagListSchema, '/cms/feature-flags', {
    query: { environment: scope.environment, platform: scope.platform },
    signal,
  })
}

/**
 * GoGo-BE#713 Q7 — every flag write carries the operator's rationale, kept in
 * the `feature_flag.set` audit entry. Optional in contract 2.0.0-alpha.3 so
 * older writers keep working; the CMS always sends it, with the server's own
 * bounds (trimmed, 3–500) checked before the request goes out.
 */
export const MIN_FLAG_REASON = 3
export const MAX_FLAG_REASON = 500

export const flagReasonSchema = z.string().trim().min(MIN_FLAG_REASON).max(MAX_FLAG_REASON)

export type SetFlagInput = {
  key: string
  /**
   * For a boolean flag this is the value. For any other type it is whether the
   * override applies at all — switching it off returns the key to its default.
   */
  enabled: boolean
  /** Typed per the key's `valueType`. Omitted for boolean flags. */
  value?: unknown
  environment?: FlagEnvironment
  platform?: FlagPlatform
  /** Required here even though the contract still accepts its absence. */
  reason: string
}

/**
 * `PUT /cms/feature-flags/{key}`.
 *
 * Sends `value`, never the deprecated `payload` — the server accepts both and
 * answers 400 if they disagree, so there is nothing to gain by using the old
 * name. Omitting `environment`/`platform` writes the unscoped `(all, all)` row,
 * which is what every resolution falls back to.
 */
export function setFlag(input: SetFlagInput) {
  const { key, enabled, value, environment, platform, reason } = input
  return apiFetch(`/cms/feature-flags/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: {
      enabled,
      ...(value === undefined ? {} : { value }),
      ...(environment ? { environment } : {}),
      ...(platform ? { platform } : {}),
      reason: reason.trim(),
    },
  })
}
