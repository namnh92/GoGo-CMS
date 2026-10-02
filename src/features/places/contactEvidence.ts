import { useCallback } from 'react'
import { useLabel, useT } from '@/shared/i18n/i18n'
import type { FieldError } from '@/shared/api/errors'
import type { Schemas } from '@/shared/api/generated'

/**
 * GoGo-BE#280 — address, phone and website are GoGo's own place data, and a
 * value is GoGo's only when it arrives with **independent evidence**: what kind
 * of source stated it, which source exactly, and when it was gathered.
 *
 * One module for the three surfaces that write these fields — the place
 * editor, the submission review draft and (by column name) the import wizard —
 * so the vocabulary cannot drift between them. Who submitted the evidence and
 * when it counts as verified are the server's to record, from the session; the
 * console never sends either.
 */

/** The wire names, exactly as `PlaceContactProvenanceInput` keys them. */
export const CONTACT_FIELDS = ['addressText', 'phone', 'website'] as const
export type ContactField = (typeof CONTACT_FIELDS)[number]

export function isContactField(field: string): field is ContactField {
  return (CONTACT_FIELDS as readonly string[]).includes(field)
}

/**
 * The source kinds an editor may claim. `google_derived` is deliberately
 * absent: copying, retyping or confirming Google content does not make it
 * GoGo's, and the server refuses it with `google_not_independent`.
 */
export const EVIDENCE_SOURCE_TYPES = ['editorial', 'community', 'provider'] as const
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number]

export const EVIDENCE_REFERENCE_MAX = 500
/** The server tolerates this much clock skew before calling a time "future". */
const FUTURE_SKEW_MS = 5 * 60_000

export type ContactEvidenceWire = Schemas['PlaceContactEvidence']
export type ContactProvenanceWire = Schemas['PlaceContactProvenanceInput']

/**
 * What the boxes hold. `collectedAt` is the `<input type="datetime-local">`
 * string — local wall-clock time with no zone — and becomes an ISO instant
 * only on the way out, so an editor in Hà Nội types the time they made the
 * call, not its UTC equivalent.
 */
export type EvidenceDraft = {
  sourceType: string
  sourceReference: string
  collectedAt: string
}

export const EMPTY_EVIDENCE: EvidenceDraft = {
  sourceType: '',
  sourceReference: '',
  collectedAt: '',
}

export type EvidenceDrafts = Record<ContactField, EvidenceDraft>

export function emptyEvidenceDrafts(): EvidenceDrafts {
  return {
    addressText: { ...EMPTY_EVIDENCE },
    phone: { ...EMPTY_EVIDENCE },
    website: { ...EMPTY_EVIDENCE },
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** An ISO instant → the local `YYYY-MM-DDTHH:mm` a datetime-local box shows. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** The box's local wall-clock time → an ISO instant with a zone, or `''`. */
export function fromLocalInput(local: string): string {
  const trimmed = local.trim()
  if (trimmed === '') return ''
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString()
}

export function evidenceFromWire(
  evidence:
    | { sourceType?: string | null; sourceReference?: string | null; collectedAt?: string | null }
    | null
    | undefined,
): EvidenceDraft {
  if (!evidence) return { ...EMPTY_EVIDENCE }
  return {
    sourceType: evidence.sourceType ?? '',
    sourceReference: evidence.sourceReference ?? '',
    collectedAt: toLocalInput(evidence.collectedAt),
  }
}

export function toWireEvidence(draft: EvidenceDraft): ContactEvidenceWire {
  return {
    sourceType: draft.sourceType.trim(),
    sourceReference: draft.sourceReference.trim(),
    collectedAt: fromLocalInput(draft.collectedAt),
  }
}

/**
 * The checks worth making before a request: the three boxes are filled, the
 * reference fits, the time is not in the future. Paths and codes are the
 * server's (`provenance.<field>.<property>`), so a local refusal and a server
 * one land on the same control through the same mapping.
 *
 * Whether a reference names Google, or names only a job or sheet, is left to
 * GoGo-BE: a second copy of that heuristic here would refuse what the server
 * accepts, or the reverse.
 */
export function evidenceIssues(
  field: ContactField,
  draft: EvidenceDraft,
  now: Date = new Date(),
): FieldError[] {
  const path = `provenance.${field}`
  const issues: FieldError[] = []
  if (!(EVIDENCE_SOURCE_TYPES as readonly string[]).includes(draft.sourceType.trim())) {
    issues.push({ field: `${path}.sourceType`, code: 'required', message: '' })
  }
  const reference = draft.sourceReference.trim()
  if (reference === '') {
    issues.push({ field: `${path}.sourceReference`, code: 'required', message: '' })
  } else if (reference.length > EVIDENCE_REFERENCE_MAX) {
    issues.push({ field: `${path}.sourceReference`, code: 'too_long', message: '' })
  }
  const collected = fromLocalInput(draft.collectedAt)
  if (collected === '') {
    issues.push({ field: `${path}.collectedAt`, code: 'required', message: '' })
  } else if (Number.isNaN(Date.parse(collected))) {
    issues.push({ field: `${path}.collectedAt`, code: 'invalid_datetime', message: '' })
  } else if (Date.parse(collected) > now.getTime() + FUTURE_SKEW_MS) {
    issues.push({ field: `${path}.collectedAt`, code: 'in_future', message: '' })
  }
  return issues
}

export type EvidenceProperty = keyof EvidenceDraft

/**
 * Where a server path about evidence belongs on screen.
 *
 * `provenance.phone` alone (`required`, `not_allowed`, `value_missing`) is
 * about the entry as a whole and lands on its first box, the source type.
 */
export function evidenceTarget(
  path: string,
): { field: ContactField; property: EvidenceProperty } | null {
  const match =
    /^provenance\.(addressText|phone|website)(?:\.(sourceType|sourceReference|collectedAt))?$/.exec(
      path,
    )
  if (!match) return null
  return {
    field: match[1] as ContactField,
    property: (match[2] as EvidenceProperty | undefined) ?? 'sourceType',
  }
}

/**
 * Words for an evidence refusal, local or from GoGo-BE — both speak the same
 * codes. An unknown code still says something true: the server's own text.
 */
export function useEvidenceError(): (issue: { code: string; message?: string }) => string {
  const t = useT()
  const label = useLabel()
  return useCallback(
    (issue) =>
      label(`contactEvidence.error.${issue.code}`, issue.message || t('placeEditor.error.invalid')),
    [t, label],
  )
}

/**
 * `ownership` as words. Anything that is not exactly `gogo` or `google` reads
 * as unknown — an unrecognised verdict must never look GoGo-verified.
 */
export function useOwnershipLabel(): (ownership: string | null | undefined) => string {
  const t = useT()
  return useCallback(
    (ownership) =>
      ownership === 'gogo'
        ? t('contactOwnership.gogo')
        : ownership === 'google'
          ? t('contactOwnership.google')
          : t('contactOwnership.unknown'),
    [t],
  )
}
