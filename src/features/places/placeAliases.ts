import type { FieldError } from '@/shared/api/errors'
import { evidenceIssues, type EvidenceDraft } from './contactEvidence'

export {
  ALIAS_LIMIT,
  ALIAS_LENGTH,
  placeAliasSchema,
  placeAliasesSchema,
} from '@/shared/api/cmsPlaceContract'

export function aliasesChanged(next: readonly string[] = [], before: readonly string[] = []) {
  // Order does not change the replacement set; normalization/deduplication is BE-owned.
  return JSON.stringify([...next].sort()) !== JSON.stringify([...before].sort())
}

export type AliasErrorPath = 'aliases' | `aliasProvenance.${keyof EvidenceDraft}`

export function aliasErrorPath(path: string): AliasErrorPath | null {
  if (/^aliases(?:\.\d+)?$/.test(path)) return 'aliases'
  if (path === 'aliasProvenance') return 'aliasProvenance.sourceReference'
  if (/^aliasProvenance\.(sourceType|sourceReference|collectedAt)$/.test(path))
    return path as AliasErrorPath
  return null
}

/** Reuse the contact evidence clock/bounds rules; alias source type is editorial only. */
export function aliasEvidenceIssues(
  draft: EvidenceDraft = { sourceType: 'editorial', sourceReference: '', collectedAt: '' },
  now: Date = new Date(),
): (FieldError & { field: AliasErrorPath })[] {
  return evidenceIssues('phone', { ...draft, sourceType: 'editorial' }, now).map((issue) => ({
    ...issue,
    field: issue.field.replace('provenance.phone.', 'aliasProvenance.') as AliasErrorPath,
  }))
}
