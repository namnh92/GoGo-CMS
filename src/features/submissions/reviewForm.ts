import { z } from 'zod'
import { PLACE_FIELD_LIMITS } from '@/shared/api/cmsPlaceContract'
import type { SubmissionReviewDraft } from '@/shared/api/contracts'
import type { FieldError } from '@/shared/api/errors'
import {
  CONTACT_FIELDS,
  emptyEvidenceDrafts,
  evidenceFromWire,
  evidenceIssues,
  toWireEvidence,
  type ContactField,
  type EvidenceDrafts,
} from '@/features/places/contactEvidence'

const L = PLACE_FIELD_LIMITS

/**
 * GoGo-BE#528 — supplementing a contribution, in the Place editor's own field
 * rules.
 *
 * The limits come from `PLACE_FIELD_LIMITS`, the one mirror of GoGo-BE's write
 * contract, rather than from a second set of numbers here. A reviewer
 * supplementing a submission and an editor editing the place afterwards are the
 * same edit at two moments; a value the form accepted and the approval rejected
 * would fail after the reviewer had already left.
 *
 * Everything is a string in the form, because that is what an `<input>` holds.
 * `toReviewDraft` is where an empty box becomes a decision — and which decision
 * it becomes is the whole subtlety, so it is spelled out there.
 */
export const reviewFormSchema = z.object({
  name: z.string().trim().max(L.name.max),
  description: z.string().max(L.description.max),
  addressText: z.string().max(L.addressText.max),
  phone: z.string().max(L.phone.max),
  website: z.string().max(L.website.max),
  avgVisitMinutes: z.string(),
  priceMin: z.string(),
  priceMax: z.string(),
  priceUnit: z.string(),
})

export type ReviewForm = z.infer<typeof reviewFormSchema>

export const PRICE_UNITS = ['per_person', 'per_item', 'per_hour', 'per_night'] as const
export type ReviewPriceUnit = (typeof PRICE_UNITS)[number]

export const EMPTY_REVIEW_FORM: ReviewForm = {
  name: '',
  description: '',
  addressText: '',
  phone: '',
  website: '',
  avgVisitMinutes: '',
  priceMin: '',
  priceMax: '',
  priceUnit: 'per_person',
}

/** The stored draft, back into the boxes it was typed in. */
export function reviewFormFrom(draft: SubmissionReviewDraft | null | undefined): ReviewForm {
  if (!draft) return { ...EMPTY_REVIEW_FORM }
  const text = (value: string | null | undefined) => value ?? ''
  const num = (value: number | null | undefined) =>
    value === null || value === undefined ? '' : String(value)
  return {
    name: text(draft.name),
    description: text(draft.description),
    addressText: text(draft.addressText),
    phone: text(draft.phone),
    website: text(draft.website),
    avgVisitMinutes: num(draft.avgVisitMinutes),
    priceMin: num(draft.priceMin),
    priceMax: num(draft.priceMax),
    priceUnit: text(draft.priceUnit) || 'per_person',
  }
}

/**
 * The form, back into the wire shape — and this is where "empty" gets its
 * meaning.
 *
 * The contract keeps three states apart, and so must this: an **absent** key
 * means the reviewer said nothing and Google's answer stands at approval; an
 * explicit **null** means clear it; a **value** replaces it. A box that has
 * never held anything and one the reviewer emptied on purpose look identical on
 * screen, so the previously-saved draft is what tells them apart — a field that
 * was saved and is now blank was cleared, and a field that was never saved and
 * is still blank is simply not being spoken about.
 *
 * Getting this wrong in either direction is a real defect: always sending
 * `null` would wipe Google's address off every place a reviewer touched, and
 * always omitting would make a filled box impossible to empty again (the shape
 * of GoGo-BE#425).
 */
export function toReviewDraft(
  form: ReviewForm,
  saved: SubmissionReviewDraft | null | undefined,
  evidence: EvidenceDrafts = emptyEvidenceDrafts(),
): SubmissionReviewDraft {
  const draft: SubmissionReviewDraft = {}
  const wasSaved = (key: keyof SubmissionReviewDraft) =>
    saved !== null && saved !== undefined && saved[key] !== null && saved[key] !== undefined

  const text = (key: 'description' | 'addressText' | 'phone' | 'website', value: string) => {
    const trimmed = value.trim()
    if (trimmed !== '') draft[key] = trimmed
    else if (wasSaved(key)) draft[key] = null
  }

  // `name` has no null: a place must have one, so an empty box is "leave it".
  if (form.name.trim() !== '') draft.name = form.name.trim()
  text('description', form.description)
  text('addressText', form.addressText)
  text('phone', form.phone)
  text('website', form.website)

  /*
   * GoGo-BE#280 — every contact value the draft carries travels with its
   * evidence, on every save. The draft is checked whole (there is no stored
   * place to compare against yet), and approval re-checks it: a value saved
   * without a source is refused `409 REVIEW_EVIDENCE_REQUIRED` at approve.
   */
  for (const field of draftContactValues(draft)) {
    draft.provenance = { ...draft.provenance, [field]: toWireEvidence(evidence[field]) }
  }

  const minutes = form.avgVisitMinutes.trim()
  if (minutes !== '') draft.avgVisitMinutes = Number(minutes)
  else if (wasSaved('avgVisitMinutes')) draft.avgVisitMinutes = null

  const min = form.priceMin.trim()
  const max = form.priceMax.trim()
  if (min !== '' && max !== '') {
    draft.priceMin = Number(min)
    draft.priceMax = Number(max)
    draft.priceUnit = form.priceUnit
  } else if (wasSaved('priceMin') || wasSaved('priceMax')) {
    draft.priceMin = null
    draft.priceMax = null
  }

  return draft
}

/**
 * Which fields the reviewer has changed since the last save, by name — what the
 * leave-guard lists so "unsaved changes" is not an unexplained refusal.
 */
export function changedReviewFields(a: ReviewForm, b: ReviewForm): (keyof ReviewForm)[] {
  return (Object.keys(a) as (keyof ReviewForm)[]).filter((key) => a[key] !== b[key])
}

/** The contact fields a draft writes a value to — each needs evidence. */
function draftContactValues(draft: SubmissionReviewDraft): ContactField[] {
  return CONTACT_FIELDS.filter((field) => typeof draft[field] === 'string')
}

/** The stored evidence, back into its boxes. */
export function reviewEvidenceFrom(
  draft: SubmissionReviewDraft | null | undefined,
): EvidenceDrafts {
  return {
    addressText: evidenceFromWire(draft?.provenance?.addressText ?? null),
    phone: evidenceFromWire(draft?.provenance?.phone ?? null),
    website: evidenceFromWire(draft?.provenance?.website ?? null),
  }
}

/** The contact boxes holding a value, which are the ones asking for a source. */
export function reviewContactFieldsWithValue(form: ReviewForm): ContactField[] {
  return CONTACT_FIELDS.filter((field) => form[field].trim() !== '')
}

/** Local evidence check before a save, in the server's paths and codes. */
export function reviewEvidenceIssues(
  form: ReviewForm,
  evidence: EvidenceDrafts,
  now: Date = new Date(),
): FieldError[] {
  return reviewContactFieldsWithValue(form).flatMap((field) =>
    evidenceIssues(field, evidence[field], now),
  )
}

export function evidenceSignature(evidence: EvidenceDrafts): string {
  return JSON.stringify(CONTACT_FIELDS.map((field) => evidence[field]))
}
