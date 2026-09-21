import type { MessageKey } from '@/shared/i18n/vi'
import type {
  AdministrativeCapability,
  AdministrativeDatasetDetail,
  AdministrativeDatasetSummary,
} from '@/shared/api/contracts-administrative'

/**
 * CMS #154 — why an action on a dataset version is not offered.
 *
 * The server is the authority and re-derives all of this inside the publishing
 * transaction; nothing here is a permission check. What it buys is an operator
 * who is told *why* a button is inert instead of clicking it to find out, and a
 * `publishable` that is never guessed client-side — the flag comes from the
 * server's own validation result and is rendered, not recomputed.
 *
 * Codes are GoGo-BE's own refusal codes wherever one exists, so the greyed-out
 * reason and the 409 a race produces say the same thing in the same words.
 */
export type ActionBlock = {
  code: string
  messageKey: MessageKey
  values?: Record<string, string | number>
}

const block = (code: string, values?: ActionBlock['values']): ActionBlock => ({
  code,
  messageKey: `administrative.block.${code}` as MessageKey,
  values,
})

/**
 * Statuses a validation run may be asked for.
 *
 * Deliberately narrow. GoGo-BE's `validate` writes the resulting lifecycle
 * status unconditionally — `publishable ? VALIDATED : STAGED` — with no
 * lifecycle guard of its own, so validating the *active* version would demote
 * it out of PUBLISHED and leave the environment with no active dataset at all,
 * and validating a ROLLED_BACK one would remove it from the restorable set.
 * Neither is something an operator asked for, so neither is offered. Reported
 * to GoGo-BE; until it refuses, this screen does not ask.
 */
const VALIDATABLE = new Set(['STAGED', 'VALIDATED'])

export function validateBlock(
  dataset: Pick<AdministrativeDatasetSummary, 'status'>,
  context: { canManage: boolean; online: boolean },
): ActionBlock | null {
  if (!context.canManage) return block('NO_PERMISSION')
  if (!context.online) return block('OFFLINE')
  if (!VALIDATABLE.has(dataset.status)) return block('NOT_VALIDATABLE', { status: dataset.status })
  return null
}

export function importBlock(context: { canManage: boolean; online: boolean }): ActionBlock | null {
  if (!context.canManage) return block('NO_PERMISSION')
  if (!context.online) return block('OFFLINE')
  return null
}

/**
 * Why this version may not be published.
 *
 * Four of GoGo-BE's gates are visible from here and are checked in its order,
 * cheapest first; the two that are not — the digest of the stored rows and the
 * validator version — are re-derived server-side, so a publication this screen
 * offers can still be refused. That is the right way round: the screen never
 * *allows* anything, it only declines to offer what is already known to fail.
 */
export function publishBlock(
  dataset: AdministrativeDatasetDetail,
  context: { canManage: boolean; online: boolean },
): ActionBlock | null {
  if (!context.canManage) return block('NO_PERMISSION')
  if (!context.online) return block('OFFLINE')
  if (dataset.status === 'PUBLISHED') return block('DATASET_ALREADY_PUBLISHED')
  if (dataset.status === 'REJECTED') return block('DATASET_REJECTED')

  const validation = dataset.validation
  /*
   * A validation that fails puts the version back to STAGED — it failed a
   * check, nobody rejected it. GoGo-BE's cheapest gate would then answer
   * "validate it first", which is the one thing the operator already did, so
   * the screen names the errors instead. Same refusal, true reason.
   */
  if (dataset.status !== 'VALIDATED') {
    if (validation && (validation.errors > 0 || !validation.publishable)) {
      return block('VALIDATION_HAS_ERRORS', { errors: validation.errors })
    }
    return block('DATASET_NOT_VALIDATED', { status: dataset.status })
  }

  if (!validation) return block('VALIDATION_MISSING')
  if (stale(dataset)) return block('VALIDATION_STALE')
  // `publishable === errors === 0`, decided by the server. An ERROR can never
  // be overridden from here, and a WARNING never blocks.
  if (!validation.publishable || validation.errors > 0) {
    return block('VALIDATION_HAS_ERRORS', { errors: validation.errors })
  }
  return null
}

/**
 * Whether the stored validation still describes this version.
 *
 * Only the four identities the contract exposes are compared. The fifth,
 * `snapshotFingerprint`, is a digest of the stored rows that only the server can
 * recompute — a row edited directly in the database is invisible from here, so
 * "not stale" is never presented as a promise that publication will be accepted.
 */
export function stale(dataset: AdministrativeDatasetDetail): boolean {
  const bound = dataset.validationReport?.boundTo
  if (!bound) return false
  return (
    bound.datasetVersionId !== dataset.id ||
    bound.combinedDatasetVersion !== dataset.combinedDatasetVersion ||
    bound.combinedChecksum !== dataset.combinedChecksum ||
    bound.overrideRevision !== dataset.overrideRevision
  )
}

/**
 * Why this version may not be re-activated.
 *
 * `restorable` is the server's own list — previously published and not active
 * now. A version missing from it is never offered a rollback, whatever its row
 * looks like from here.
 */
export function rollbackBlock(
  dataset: AdministrativeDatasetSummary,
  context: { canManage: boolean; online: boolean; restorable: boolean },
): ActionBlock | null {
  if (!context.canManage) return block('NO_PERMISSION')
  if (!context.online) return block('OFFLINE')
  if (dataset.status === 'PUBLISHED') return block('DATASET_ALREADY_PUBLISHED')
  if (!dataset.publishedAt) return block('DATASET_NEVER_PUBLISHED')
  if (!context.restorable) return block('DATASET_NOT_RESTORABLE', { status: dataset.status })
  return null
}

/**
 * What the capability response means, facet by facet.
 *
 * One line per fact rather than a single verdict, because they are independent:
 * a missing boundary release degrades the resolver and nothing else, while a
 * missing dataset stops every place approval in the catalogue.
 *
 * `publication: BLOCKED` is deliberately **not** a reason to disable publishing
 * a dataset. It means no dataset is published — which is the condition
 * publishing one resolves. Disabling the button on it would make a fresh
 * environment unable to leave the state the flag is reporting.
 */
export type CapabilityFact = {
  id: 'dataset' | 'boundaries' | 'resolver' | 'publication'
  tone: 'mint' | 'amber' | 'danger'
  labelKey: MessageKey
  valueKey: MessageKey
  detailKey: MessageKey | null
}

export function capabilityFacts(capability: AdministrativeCapability): CapabilityFact[] {
  const datasetOk = capability.dataset.state === 'AVAILABLE'
  const boundariesOk = capability.boundaries.state === 'AVAILABLE'
  return [
    {
      id: 'dataset',
      tone: datasetOk ? 'mint' : capability.dataset.state === 'ERROR' ? 'danger' : 'danger',
      labelKey: 'administrative.capability.dataset',
      valueKey: `administrative.state.${capability.dataset.state}` as MessageKey,
      detailKey: datasetOk ? null : 'administrative.capability.datasetMissing',
    },
    {
      id: 'boundaries',
      tone: boundariesOk ? 'mint' : capability.boundaries.state === 'ERROR' ? 'danger' : 'amber',
      labelKey: 'administrative.capability.boundaries',
      valueKey: `administrative.state.${capability.boundaries.state}` as MessageKey,
      detailKey: boundariesOk ? null : 'administrative.capability.boundariesMissing',
    },
    {
      id: 'resolver',
      tone:
        capability.resolver === 'FULL'
          ? 'mint'
          : capability.resolver === 'PARTIAL'
            ? 'amber'
            : 'danger',
      labelKey: 'administrative.capability.resolver',
      valueKey: `administrative.resolver.${capability.resolver}` as MessageKey,
      detailKey:
        capability.resolver === 'FULL'
          ? null
          : `administrative.resolver.${capability.resolver}Hint`,
    },
    {
      id: 'publication',
      tone: capability.publication === 'ENABLED' ? 'mint' : 'danger',
      labelKey: 'administrative.capability.publication',
      valueKey: `administrative.publication.${capability.publication}` as MessageKey,
      detailKey:
        capability.publication === 'ENABLED'
          ? null
          : 'administrative.capability.publicationBlocked',
    },
  ]
}

/** Categories GoGo-BE's diff can produce, in the order the screen shows them. */
export const DIFF_CATEGORIES = [
  'CREATED',
  'RENAMED',
  'MERGED',
  'SPLIT',
  'REASSIGNED',
  'DISSOLVED',
  'PARENT_CHANGED',
  'STATUS_CHANGED',
  'EFFECTIVE_PERIOD_CHANGED',
  'UNRESOLVED',
  'SOURCE_DRIFT',
  /* ADM-011 / ADM-028 — what a reviewer round changed, apart from the source. */
  'OVERRIDE_ACCEPTED',
  'OVERRIDE_TARGET_CHANGED',
  'OVERRIDE_RETRACTED',
] as const
export type DiffCategory = (typeof DIFF_CATEGORIES)[number]

/**
 * Categories to show, in the fixed order above, with any the server invented
 * appended rather than dropped. A category the contract does not list is news,
 * and hiding it would make the screen quietly wrong the first time GoGo-BE adds
 * one.
 */
export function orderedCategories(counts: Record<string, number>): string[] {
  const known = DIFF_CATEGORIES.filter((category) => category in counts)
  const extra = Object.keys(counts).filter(
    (category) => !(DIFF_CATEGORIES as readonly string[]).includes(category),
  )
  return [...known, ...extra.sort()]
}
