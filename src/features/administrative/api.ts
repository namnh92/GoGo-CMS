import { apiFetch, apiFetchParsed, newIdempotencyKey } from '@/shared/api/client'
import {
  administrativeCapabilitySchema,
  administrativeDatasetDetailSchema,
  administrativeDatasetDiffSchema,
  administrativeDatasetPageSchema,
  administrativeImportReportSchema,
  administrativeMappingDetailSchema,
  administrativeMappingPageSchema,
  administrativeRemediationSchema,
  administrativeRestorableSchema,
  administrativeTransitionResultSchema,
  administrativeValidateResultSchema,
  type AdministrativeCapability,
  type AdministrativeDatasetDetail,
  type AdministrativeDatasetDiff,
  type AdministrativeDatasetPage,
  type AdministrativeImportReport,
  type AdministrativeMappingDetail,
  type AdministrativeMappingPage,
  type AdministrativeMappingStatus,
  type AdministrativeRemediation,
  type AdministrativeRestorable,
  type AdministrativeTransitionResult,
  type AdministrativeValidateResult,
} from '@/shared/api/contracts-administrative'

/**
 * CMS #153 — the client half of GoGo-BE ADM-005 and ADM-009, vendored at
 * OpenAPI `1.0.0-alpha.8`.
 *
 * Written here in full, ahead of the screens that use it in #154–#156, because
 * that is what makes those issues screen work rather than screen-plus-contract
 * work — and because a contract discovered a screen at a time is a contract
 * that gets guessed at.
 *
 * Two conventions worth stating. **Every mutation carries an
 * `Idempotency-Key`**, which the API honours by replaying the original response
 * rather than acting twice — a reviewer double-clicking verify must not produce
 * two audit rows. And **`expectedUpdatedAt` is required on every decision**: it
 * is the `place.updatedAt` the reviewer's screen was showing, and a mismatch is
 * a `409 PLACE_MODIFIED` rather than a lost update.
 */

// --- datasets (ADM-005) ------------------------------------------------------

export function fetchAdministrativeCapability(
  signal?: AbortSignal,
): Promise<AdministrativeCapability> {
  return apiFetchParsed(administrativeCapabilitySchema, '/cms/administrative-datasets/capability', {
    signal,
  })
}

export function fetchAdministrativeDatasets(
  options: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<AdministrativeDatasetPage> {
  const query = new URLSearchParams()
  if (options.limit !== undefined) query.set('limit', String(options.limit))
  if (options.offset !== undefined) query.set('offset', String(options.offset))
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return apiFetchParsed(administrativeDatasetPageSchema, `/cms/administrative-datasets${suffix}`, {
    signal,
  })
}

export function fetchAdministrativeDataset(
  id: string,
  signal?: AbortSignal,
): Promise<AdministrativeDatasetDetail> {
  return apiFetchParsed(administrativeDatasetDetailSchema, `/cms/administrative-datasets/${id}`, {
    signal,
  })
}

/**
 * Versions a rollback could restore: previously published, not active now.
 * The server decides this, and the screen offers rollback for nothing else — a
 * version that was never published is not a rollback target, it is an unpublished
 * one.
 */
export function fetchRestorableAdministrativeDatasets(
  signal?: AbortSignal,
): Promise<AdministrativeRestorable> {
  return apiFetchParsed(administrativeRestorableSchema, '/cms/administrative-datasets/restorable', {
    signal,
  })
}

export function fetchAdministrativeDatasetDiff(
  id: string,
  options: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<AdministrativeDatasetDiff> {
  const query = new URLSearchParams()
  if (options.limit !== undefined) query.set('limit', String(options.limit))
  if (options.offset !== undefined) query.set('offset', String(options.offset))
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return apiFetchParsed(
    administrativeDatasetDiffSchema,
    `/cms/administrative-datasets/${id}/diff${suffix}`,
    { signal },
  )
}

/**
 * Every mutation below takes the key rather than minting one internally.
 *
 * A key minted inside the call is a new key on every attempt, which turns the
 * retry of a request that may already have been applied into a second
 * operation. The screen mints one when the operator opens a confirmation and
 * reuses that same key for the retries of *that* decision — so a double-click,
 * a flaky connection or a second press of the same button replays the original
 * response instead of importing twice.
 */
export type Idempotent = { idempotencyKey?: string }

/** Writes a STAGED version only; it can never touch the active dataset. */
export function importAdministrativeDataset(
  overrideRevision = 0,
  { idempotencyKey = newIdempotencyKey() }: Idempotent = {},
): Promise<AdministrativeImportReport> {
  return apiFetchParsed(administrativeImportReportSchema, '/cms/administrative-datasets/import', {
    method: 'POST',
    body: { overrideRevision },
    idempotencyKey,
  })
}

export function validateAdministrativeDataset(
  id: string,
  { idempotencyKey = newIdempotencyKey() }: Idempotent = {},
): Promise<AdministrativeValidateResult> {
  return apiFetchParsed(
    administrativeValidateResultSchema,
    `/cms/administrative-datasets/${id}/validate`,
    { method: 'POST', idempotencyKey },
  )
}

/**
 * Takes an id and nothing else. The server re-reads the lifecycle status, the
 * checksums, the staged rows and the validation bound to them inside the
 * publishing transaction — a `publishable` flag sent from here would not be
 * consulted, so none is sent.
 */
export function publishAdministrativeDataset(
  id: string,
  { idempotencyKey = newIdempotencyKey() }: Idempotent = {},
): Promise<AdministrativeTransitionResult> {
  return apiFetchParsed(
    administrativeTransitionResultSchema,
    `/cms/administrative-datasets/${id}/publish`,
    { method: 'POST', idempotencyKey },
  )
}

/**
 * Re-activates a version that was published before. Nothing is deleted, no
 * migration is reversed and no stored address text is rewritten — mappings that
 * no longer resolve against the restored version come back in `staleMappings`
 * as a report, not as writes.
 */
export function rollbackAdministrativeDataset(
  id: string,
  { idempotencyKey = newIdempotencyKey() }: Idempotent = {},
): Promise<AdministrativeTransitionResult> {
  return apiFetchParsed(
    administrativeTransitionResultSchema,
    `/cms/administrative-datasets/${id}/rollback`,
    { method: 'POST', idempotencyKey },
  )
}

// --- mapping moderation (ADM-009) --------------------------------------------

export function fetchAdministrativeMappings(
  options: {
    status?: AdministrativeMappingStatus[]
    placeStatus?: string[]
    blockedApprovalOnly?: boolean
    limit?: number
    cursor?: string
  } = {},
  signal?: AbortSignal,
): Promise<AdministrativeMappingPage> {
  const query = new URLSearchParams()
  if (options.status?.length) query.set('status', options.status.join(','))
  if (options.placeStatus?.length) query.set('placeStatus', options.placeStatus.join(','))
  if (options.blockedApprovalOnly) query.set('blockedApprovalOnly', 'true')
  if (options.limit !== undefined) query.set('limit', String(options.limit))
  if (options.cursor) query.set('cursor', options.cursor)
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return apiFetchParsed(administrativeMappingPageSchema, `/cms/administrative-mappings${suffix}`, {
    signal,
  })
}

export function fetchAdministrativeRemediation(
  signal?: AbortSignal,
): Promise<AdministrativeRemediation> {
  return apiFetchParsed(
    administrativeRemediationSchema,
    '/cms/administrative-mappings/remediation',
    { signal },
  )
}

export function fetchPlaceAdministrativeMapping(
  placeId: string,
  signal?: AbortSignal,
): Promise<AdministrativeMappingDetail> {
  return apiFetchParsed(
    administrativeMappingDetailSchema,
    `/cms/places/${placeId}/administrative-mapping`,
    { signal },
  )
}

export type MappingDecision = {
  expectedUpdatedAt: string
}

/** The only path that writes VERIFIED. No confidence is sent: there is none. */
export function verifyPlaceMapping(
  placeId: string,
  input: MappingDecision & {
    provinceCode: string
    communeCode: string
    legacyDistrictCode?: string | null
    note?: string
  },
) {
  return apiFetch(`/cms/places/${placeId}/administrative-mapping/verify`, {
    method: 'POST',
    body: input,
    idempotencyKey: newIdempotencyKey(),
  })
}

/** Rejects the mapping. The place's own moderation state is untouched. */
export function rejectPlaceMapping(placeId: string, input: MappingDecision & { reason: string }) {
  return apiFetch(`/cms/places/${placeId}/administrative-mapping/reject`, {
    method: 'POST',
    body: input,
    idempotencyKey: newIdempotencyKey(),
  })
}

/**
 * The only route that reopens a rejected mapping. Asking for a rematch is not
 * verifying anything: the previous reviewer's attribution is cleared and the
 * requester is recorded in the audit as the requester.
 */
export function rematchPlaceMapping(placeId: string, input: MappingDecision & { reason: string }) {
  return apiFetch(`/cms/places/${placeId}/administrative-mapping/rematch`, {
    method: 'POST',
    body: input,
    idempotencyKey: newIdempotencyKey(),
  })
}

/** Changing a decision somebody already made. The audit names both people. */
export function correctPlaceMapping(
  placeId: string,
  input: MappingDecision & {
    provinceCode: string
    communeCode: string
    legacyDistrictCode?: string | null
    reason: string
  },
) {
  return apiFetch(`/cms/places/${placeId}/administrative-mapping/correct`, {
    method: 'POST',
    body: input,
    idempotencyKey: newIdempotencyKey(),
  })
}

/** ops_admin, not moderator: reconciliation belongs to whoever published the dataset. */
export function reconcilePlaceMapping(placeId: string) {
  return apiFetch(`/cms/places/${placeId}/administrative-mapping/reconcile`, {
    method: 'POST',
    idempotencyKey: newIdempotencyKey(),
  })
}
