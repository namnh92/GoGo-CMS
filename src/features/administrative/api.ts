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
  administrativeMaterializeResultSchema,
  administrativeOverrideAbandonResultSchema,
  administrativeOverrideDecisionResultSchema,
  administrativeOverrideSetSchema,
  administrativeQuarantineDetailSchema,
  administrativeQuarantinePageSchema,
  administrativeReconcileResultSchema,
  administrativeRematchResultSchema,
  administrativeRestorableSchema,
  administrativeTransitionResultSchema,
  administrativeUnitPageSchema,
  administrativeValidateResultSchema,
  administrativeVerifyResultSchema,
  type AdministrativeCapability,
  type AdministrativeDatasetDetail,
  type AdministrativeDatasetDiff,
  type AdministrativeDatasetPage,
  type AdministrativeImportReport,
  type AdministrativeMappingDetail,
  type AdministrativeMappingPage,
  type AdministrativeDecisionState,
  type AdministrativeMappingStatus,
  type AdministrativeMaterializeResult,
  type AdministrativeOverrideDecisionResult,
  type AdministrativeOverrideSet,
  type AdministrativeQuarantineDetail,
  type AdministrativeQuarantinePage,
  type AdministrativeReconcileResult,
  type AdministrativeRematchResult,
  type AdministrativeRemediation,
  type AdministrativeRestorable,
  type AdministrativeTransitionResult,
  type AdministrativeUnitDto,
  type AdministrativeUnitPage,
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

// --- source-drift adjudication (ADM-011, alpha.10) ---------------------------

/**
 * The review queue for one dataset's quarantined advisory rows.
 *
 * Cursor-paged on the server. 1,033 rows is the pinned backlog and none of it
 * belongs in browser memory; the cursor keys on the source code, so a decision
 * appended mid-review cannot shift the page boundary under the reviewer.
 */
export function fetchAdministrativeQuarantine(
  datasetId: string,
  options: {
    classification?: string[]
    decisionState?: AdministrativeDecisionState[]
    limit?: number
    cursor?: string | null
  } = {},
  signal?: AbortSignal,
): Promise<AdministrativeQuarantinePage> {
  return apiFetchParsed(
    administrativeQuarantinePageSchema,
    `/cms/administrative-datasets/${datasetId}/quarantine`,
    {
      query: {
        classification: options.classification?.length
          ? options.classification.join(',')
          : undefined,
        decisionState: options.decisionState?.length ? options.decisionState.join(',') : undefined,
        limit: options.limit,
        cursor: options.cursor ?? undefined,
      },
      signal,
    },
  )
}

export function fetchQuarantineRow(
  datasetId: string,
  rowId: string,
  signal?: AbortSignal,
): Promise<AdministrativeQuarantineDetail> {
  return apiFetchParsed(
    administrativeQuarantineDetailSchema,
    `/cms/administrative-datasets/${datasetId}/quarantine/${rowId}`,
    { signal },
  )
}

export function fetchOverrideSet(
  datasetId: string,
  signal?: AbortSignal,
): Promise<AdministrativeOverrideSet> {
  return apiFetchParsed(
    administrativeOverrideSetSchema,
    `/cms/administrative-datasets/${datasetId}/override-set`,
    { signal },
  )
}

/**
 * Accept one advisory edge onto a target the reviewer names.
 *
 * `targetCode` never travels alone: a code alone is not an identity, and the
 * server refuses one whose effective period it does not hold. `expectedRevision`
 * is the draft revision the screen was showing — without it two reviewers
 * deciding the same row a second apart both succeed and the second silently
 * wins.
 *
 * It creates a *draft* decision. Nothing the API answers changes until the set
 * is materialised, validated and published.
 */
export function acceptQuarantineRow(
  datasetId: string,
  rowId: string,
  input: {
    targetCode: string
    targetEffectiveFrom: string
    reason: string
    expectedRevision: number
  },
  { idempotencyKey = newIdempotencyKey() }: Idempotent = {},
): Promise<AdministrativeOverrideDecisionResult> {
  return apiFetchParsed(
    administrativeOverrideDecisionResultSchema,
    `/cms/administrative-datasets/${datasetId}/quarantine/${rowId}/accept`,
    { method: 'POST', body: input, idempotencyKey },
  )
}

/**
 * Refuse the advisory edge. It deletes no evidence and rejects no place — the
 * row keeps its raw payload and travels into the derived dataset with the
 * decision recorded beside it.
 */
export function rejectQuarantineRow(
  datasetId: string,
  rowId: string,
  input: { reason: string; expectedRevision: number },
  { idempotencyKey = newIdempotencyKey() }: Idempotent = {},
): Promise<AdministrativeOverrideDecisionResult> {
  return apiFetchParsed(
    administrativeOverrideDecisionResultSchema,
    `/cms/administrative-datasets/${datasetId}/quarantine/${rowId}/reject`,
    { method: 'POST', body: input, idempotencyKey },
  )
}

/**
 * Turn the effective decisions into one new STAGED dataset.
 *
 * It validates nothing and publishes nothing. The derived version goes through
 * the ordinary validate → diff → publish path, which is why the screen shows
 * that sequence rather than doing any of it.
 */
export function materializeOverrideSet(
  datasetId: string,
  input: { reason: string; expectedRevision: number },
  { idempotencyKey = newIdempotencyKey() }: Idempotent = {},
): Promise<AdministrativeMaterializeResult> {
  return apiFetchParsed(
    administrativeMaterializeResultSchema,
    `/cms/administrative-datasets/${datasetId}/override-set/materialize`,
    { method: 'POST', body: input, idempotencyKey },
  )
}

/** Close a draft nobody is going to materialise. The decisions stay readable. */
export function abandonOverrideSet(
  datasetId: string,
  input: { reason: string; expectedRevision: number },
  { idempotencyKey = newIdempotencyKey() }: Idempotent = {},
) {
  return apiFetchParsed(
    administrativeOverrideAbandonResultSchema,
    `/cms/administrative-datasets/${datasetId}/override-set/abandon`,
    { method: 'POST', body: input, idempotencyKey },
  )
}

// --- current administrative units, for every unit selector (ADM-003) ---------

/**
 * The maximum the public read API accepts. Asking for more is not "ask for
 * everything" — it is a 400, and that is exactly what happened: `fetchCommunes`
 * sent `limit=500`, DEV answered `400`, and the reviewer's Phường/Xã box was
 * empty. An empty box reads as "this province has no communes", which is a
 * different and much more believable lie than "the request was malformed".
 */
export const ADMINISTRATIVE_PAGE_LIMIT = 200

/**
 * A guard, not a limit. 200 × 200 is 40,000 units — an order of magnitude more
 * than Vietnam has at any level — so reaching it means the cursor is not
 * advancing, and looping forever on a server bug is worse than showing a
 * shorter list.
 */
const MAX_PAGES = 200

/**
 * Every page of one administrative list.
 *
 * The old fetchers took one page and stopped. That happened to work for
 * provinces, because 34 fit inside a limit of 100 — and "happened to work" is
 * the problem: the count has changed twice in two years, and the first release
 * that pushes it past a page would silently drop provinces off the end of a
 * dropdown with nothing to show that it had.
 *
 * `total` comes back on every page, so the result can be checked against what
 * the server said it had rather than against a number written here.
 */
async function fetchAllPages(
  path: string,
  query: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<AdministrativeUnitPage> {
  const items: AdministrativeUnitDto[] = []
  let cursor: string | undefined
  let last: AdministrativeUnitPage | null = null

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result: AdministrativeUnitPage = await apiFetchParsed(
      administrativeUnitPageSchema,
      path,
      { query: { ...query, limit: ADMINISTRATIVE_PAGE_LIMIT, cursor }, signal },
    )
    items.push(...result.items)
    last = result
    if (!result.nextCursor || result.nextCursor === cursor) break
    cursor = result.nextCursor
  }

  return {
    items,
    // The whole set is in hand, so there is nothing left to page to.
    nextCursor: null,
    total: last?.total ?? items.length,
    datasetVersion: last?.datasetVersion ?? '',
  }
}

/**
 * Every current province, from GoGo-BE.
 *
 * The public read, not an upstream one: ADR-0019 §9.5 forbids fetching
 * administrative data from anywhere else, and the identities a reviewer picks
 * have to come from the same dataset the decision will be validated against.
 */
export function fetchProvinces(signal?: AbortSignal): Promise<AdministrativeUnitPage> {
  return fetchAllPages('/administrative/provinces', {}, signal)
}

/** Every current commune of one province, in the active dataset. */
export function fetchCommunes(
  provinceCode: string,
  signal?: AbortSignal,
): Promise<AdministrativeUnitPage> {
  return fetchAllPages(`/administrative/provinces/${provinceCode}/communes`, {}, signal)
}

/**
 * Server-side search over the active dataset.
 *
 * Typing is how an editor finds a commune among thousands, and the server
 * already normalises Vietnamese the way the catalogue does — so "ba dinh"
 * finds "Phường Ba Đình" here and would not find it in a client-side
 * `includes()` over accented strings.
 *
 * Legacy units are excluded, and not by an option: this search feeds pickers
 * for the two levels that currently exist, and offering a district dissolved on
 * 2025-07-01 as something to choose would be offering a unit that is gone.
 */
export function searchAdministrativeUnits(
  input: { query: string; provinceCode?: string | undefined },
  signal?: AbortSignal,
): Promise<AdministrativeUnitPage> {
  return apiFetchParsed(administrativeUnitPageSchema, '/administrative/search', {
    query: {
      query: input.query,
      provinceCode: input.provinceCode,
      limit: ADMINISTRATIVE_PAGE_LIMIT,
    },
    signal,
  })
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
  { idempotencyKey = newIdempotencyKey() }: Idempotent = {},
) {
  return apiFetchParsed(
    administrativeVerifyResultSchema,
    `/cms/places/${placeId}/administrative-mapping/verify`,
    { method: 'POST', body: input, idempotencyKey },
  )
}

/** Rejects the mapping. The place's own moderation state is untouched. */
export function rejectPlaceMapping(
  placeId: string,
  input: MappingDecision & { reason: string },
  { idempotencyKey = newIdempotencyKey() }: Idempotent = {},
) {
  return apiFetch(`/cms/places/${placeId}/administrative-mapping/reject`, {
    method: 'POST',
    body: input,
    idempotencyKey,
  })
}

/**
 * The only route that reopens a rejected mapping. Asking for a rematch is not
 * verifying anything: the previous reviewer's attribution is cleared and the
 * requester is recorded in the audit as the requester.
 */
export function rematchPlaceMapping(
  placeId: string,
  input: MappingDecision & { reason: string },
  { idempotencyKey = newIdempotencyKey() }: Idempotent = {},
): Promise<AdministrativeRematchResult> {
  return apiFetchParsed(
    administrativeRematchResultSchema,
    `/cms/places/${placeId}/administrative-mapping/rematch`,
    { method: 'POST', body: input, idempotencyKey },
  )
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
  { idempotencyKey = newIdempotencyKey() }: Idempotent = {},
) {
  return apiFetch(`/cms/places/${placeId}/administrative-mapping/correct`, {
    method: 'POST',
    body: input,
    idempotencyKey,
  })
}

/** ops_admin, not moderator: reconciliation belongs to whoever published the dataset. */
export function reconcilePlaceMapping(
  placeId: string,
  { idempotencyKey = newIdempotencyKey() }: Idempotent = {},
): Promise<AdministrativeReconcileResult> {
  return apiFetchParsed(
    administrativeReconcileResultSchema,
    `/cms/places/${placeId}/administrative-mapping/reconcile`,
    { method: 'POST', idempotencyKey },
  )
}
