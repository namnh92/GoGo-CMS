import { z } from 'zod'
import type { Schemas } from './generated'

/**
 * Ingestion shapes. These DO exist in `openapi/gogo.v1.yaml`
 * (`ImportJob`, `ImportRow`, `ImportCandidate`, `IngestMessage`) — the zod
 * mirrors below exist only to validate at runtime; the field names track the
 * spec one-for-one and must be regenerated whenever the spec moves.
 */

export const importJobStatusSchema = z.enum([
  'uploaded',
  'validating',
  'processing',
  'review_required',
  'completed',
  'partial_success',
  'failed',
  'cancelled',
  'paused_provider_quota',
])
export type ImportJobStatus = z.infer<typeof importJobStatusSchema>

export const importModeSchema = z.enum(['dry_run', 'create_drafts', 'publish_approved'])
export type ImportMode = z.infer<typeof importModeSchema>

export const importSourceTypeSchema = z.enum(['csv', 'xlsx', 'google_sheet', 'mobile_link'])
export type ImportSourceType = z.infer<typeof importSourceTypeSchema>

export const importTotalsSchema = z.object({
  rows: z.number().int().default(0),
  processed: z.number().int().default(0),
  success: z.number().int().default(0),
  warnings: z.number().int().default(0),
  failed: z.number().int().default(0),
})
export type ImportTotals = z.infer<typeof importTotalsSchema>

export const importJobSummarySchema = z.object({
  id: z.string(),
  status: importJobStatusSchema,
  mode: importModeSchema,
  sourceType: importSourceTypeSchema,
  sourceFileName: z.string().nullish(),
  totals: importTotalsSchema.default({}),
  createdAt: z.string().nullish(),
  completedAt: z.string().nullish(),
  createdBy: z.string().nullish(),
})
export type ImportJobSummary = z.infer<typeof importJobSummarySchema>

export const importJobSchema = importJobSummarySchema.extend({
  defaultCity: z.string().nullish(),
  rowsByStatus: z.record(z.number().int()).default({}),
  startedAt: z.string().nullish(),
  cancelledAt: z.string().nullish(),
  reused: z.boolean().default(false),
  /**
   * Parse-time diagnostics, `tabName:value`. Both used to arrive only on the
   * create response — which the wizard drops when it navigates to the detail
   * screen — so the chips below rendered an array that was always empty.
   */
  unmappedHeaders: z.array(z.string()).default([]),
  missingRequiredColumns: z.array(z.string()).default([]),
  retriedRows: z.number().int().nullish(),
})
export type ImportJob = z.infer<typeof importJobSchema>

export const importJobListSchema = z.object({
  items: z.array(importJobSummarySchema).default([]),
  nextOffset: z.number().int().nullable().default(null),
})

export const importRowStatusSchema = z.enum([
  'pending',
  'validation_failed',
  'resolving',
  'unresolved',
  'needs_confirmation',
  'duplicate',
  'ready',
  'imported',
  'failed',
])
export type ImportRowStatus = z.infer<typeof importRowStatusSchema>

export const ingestMessageSchema = z.object({
  code: z.string(),
  field: z.string().nullish(),
  message: z.string().nullish(),
})
export type IngestMessage = z.infer<typeof ingestMessageSchema>

export const importCandidateSchema = z.object({
  googlePlaceId: z.string(),
  name: z.string(),
  address: z.string().nullish(),
  confidence: z.number().min(0).max(1),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  /** Provider facts carry attribution and a fetch time (FR-INGEST-014). */
  rating: z.number().nullish(),
  ratingCount: z.number().int().nullish(),
  photoUrl: z.string().nullish(),
  fetchedAt: z.string().nullish(),
  attributions: z.array(z.string()).default([]),
})
export type ImportCandidate = z.infer<typeof importCandidateSchema>

/**
 * ADM-107 — which of Vietnam's two current administrative levels a row lands
 * in, and what that means for the row.
 *
 * The same shape before and after the commit: while the job is reviewable it is
 * a **preview** computed from the coordinate the provider returned; once the
 * row is `imported` it is what GoGo actually stored. Both come from the same
 * resolver over the same coordinate, which is what makes comparing them worth
 * anything.
 *
 * `requiresReview` and `blocksPublication` are different questions and are kept
 * apart on purpose. The first is about the **mapping** — the resolver could not
 * decide, and a person must. The second is about **publication**, and is true
 * whenever a mapping exists at all: no import result is a verification, and a
 * screen that rendered `AUTO_MATCHED` as "đã xác minh" would claim something
 * the server refuses to act on.
 */
export const importAdministrativeSchema = z.object({
  provinceCode: z.string().nullish(),
  provinceName: z.string().nullish(),
  communeCode: z.string().nullish(),
  communeName: z.string().nullish(),
  status: z
    .enum(['UNMAPPED', 'AUTO_MATCHED', 'NEEDS_REVIEW', 'VERIFIED', 'REJECTED', 'STALE'])
    .nullish(),
  datasetVersion: z.string().nullish(),
  requiresReview: z.boolean().default(false),
  blocksPublication: z.boolean().default(false),
  /**
   * Why publishing is blocked, in the approval policy's own closed vocabulary,
   * or null. `blocksPublication` is derived from this, not asserted — a row
   * matching a place a reviewer already verified does not block, and that is
   * the case the old "a mapping exists, so it blocks" rule got wrong.
   */
  approvalBlock: z.object({ code: z.string(), message: z.string() }).nullish(),
})
export type ImportAdministrativeIdentity = z.infer<typeof importAdministrativeSchema>

export const importRowSchema = z.object({
  id: z.string(),
  rowNumber: z.number().int(),
  sourceRowId: z.string().nullish(),
  status: importRowStatusSchema,
  normalized: z.record(z.unknown()).default({}),
  resolvedGooglePlaceId: z.string().nullish(),
  matchedPlaceId: z.string().nullish(),
  matchedPlaceName: z.string().nullish(),
  matchConfidence: z.number().nullish(),
  matchReasons: z.array(z.string()).default([]),
  candidates: z.array(importCandidateSchema).default([]),
  /** ADM-107. Null until the row has resolved against the provider. */
  administrative: importAdministrativeSchema.nullish(),
  errors: z.array(ingestMessageSchema).default([]),
  warnings: z.array(ingestMessageSchema).default([]),
})
export type ImportRow = z.infer<typeof importRowSchema>

export const importRowListSchema = z.object({
  items: z.array(importRowSchema).default([]),
  nextOffset: z.number().int().nullable().default(null),
})

export const importRowDecisionSchema = z.object({
  id: z.string(),
  status: z.string(),
  resolvedGooglePlaceId: z.string().nullish(),
  matchedPlaceId: z.string().nullish(),
  matchConfidence: z.number().nullish(),
  administrative: importAdministrativeSchema.nullish(),
  errors: z.array(ingestMessageSchema).default([]),
  warnings: z.array(ingestMessageSchema).default([]),
})

export const importPublishResultSchema = z.object({
  jobId: z.string(),
  created: z.number().int().default(0),
  failed: z.array(z.object({ rowId: z.string(), code: z.string() })).default([]),
})
export type ImportPublishResult = z.infer<typeof importPublishResultSchema>

/**
 * The canonical vocabulary, owned by GoGo-BE and published as
 * `ImportCanonicalField`. These are the exact values that go on the wire —
 * there is no camelCase translation layer, because there is nothing to
 * translate to: `google_maps_url` is the field's name.
 *
 * This replaces a hand-written list that had drifted into a second vocabulary
 * (`googleMapsUrl`, `priceMin`) plus three fields the server has no column for
 * (`address`, `phone`, `website`). The server used to discard anything it did
 * not recognise and auto-detect instead, so the mapping screen silently did
 * nothing; it now answers 400 `MAPPING_FIELD_UNKNOWN`, which is why this list
 * can no longer be maintained by hand.
 */
export type ImportCanonicalField = Schemas['ImportCanonicalField']

export const IMPORT_CANONICAL_FIELDS = [
  'source_row_id',
  'name',
  'city',
  'district',
  'google_maps_url',
  'google_maps_query',
  'google_place_id',
  'category',
  'category_raw',
  'price_min',
  'price_max',
  'price_unit',
  'price_raw',
  'audiences',
  'audiences_raw',
  'vibes',
  'vibes_raw',
  'highlight',
  'note',
  'phone',
  'website',
  'avg_visit_minutes',
  'is_lodging',
  'curated_rank',
] as const satisfies readonly ImportCanonicalField[]

/**
 * Compile-time exhaustiveness: `satisfies` proves every entry above is a real
 * canonical field, and this proves none is missing. Regenerating a spec that
 * adds a field breaks the build here rather than quietly leaving it out of the
 * wizard.
 */
type UnlistedCanonicalField = Exclude<
  ImportCanonicalField,
  (typeof IMPORT_CANONICAL_FIELDS)[number]
>
const _everyFieldIsListed: UnlistedCanonicalField extends never ? true : never = true
void _everyFieldIsListed

/**
 * Fields the server fills in by itself, so the wizard must not present them as
 * something an operator has to map or is missing. `source_row_id` is derived
 * from row position when a sheet has no column for it (GoGo-BE#274) — it stays
 * in the canonical vocabulary for API callers that do supply real ids.
 */
export const SYSTEM_DERIVED_FIELDS: readonly ImportCanonicalField[] = ['source_row_id']

/**
 * ADM-107 — fields the wizard no longer offers, though the API still takes them.
 *
 * `district` names a tier dissolved on 2025-07-01. It stays in the canonical
 * vocabulary and stays accepted, because a legacy sheet has that column and the
 * server reads it as *historical* name evidence — a dissolved unit with exactly
 * one canonical successor is how a place mapped before the reorganisation gets
 * found. What it must not be is a **choice**: presenting it in the mapping step
 * tells an operator that GoGo files places under districts, which is the thing
 * that stopped being true.
 *
 * Auto-detection on the server is unaffected, so a sheet whose header says
 * "Quận/Huyện" still contributes that evidence without anyone selecting it.
 */
export const RETIRED_MAPPABLE_FIELDS: readonly ImportCanonicalField[] = [
  'district',
  /**
   * PI-CMS-009 — the legacy free-text columns.
   *
   * Every one of them exists to read a sheet nobody writes any more:
   * `category_raw` needs an editor to map a string GoGo has no key for,
   * `price_raw` is parsed into the three columns beside it, and the two `*_raw`
   * lists are parsed into keyed ones. The API still reads all four, so an old
   * file uploads exactly as before — they simply stop being something an
   * operator is invited to choose for a new one.
   */
  'category_raw',
  'price_raw',
  'audiences_raw',
  'vibes_raw',
]

/** Fields an operator can choose in the mapping step. */
export const MAPPABLE_FIELDS: readonly ImportCanonicalField[] = IMPORT_CANONICAL_FIELDS.filter(
  (field) => !SYSTEM_DERIVED_FIELDS.includes(field) && !RETIRED_MAPPABLE_FIELDS.includes(field),
)

/**
 * Required columns, mirroring `resolveMapping`'s own list. `source_row_id` is
 * absent on purpose: the server derives it. `city` is required as a *value*,
 * not as a column — a default city satisfies it — so the server decides, and
 * the wizard reads `missingRequiredColumns` rather than guessing.
 */
export const REQUIRED_MAPPABLE_FIELDS: readonly ImportCanonicalField[] = ['category']

export function isCanonicalField(value: string): value is ImportCanonicalField {
  return (IMPORT_CANONICAL_FIELDS as readonly string[]).includes(value)
}

/** A job is still moving — the detail screen polls while this is true. */
export function isJobLive(status: ImportJobStatus): boolean {
  return status === 'uploaded' || status === 'validating' || status === 'processing'
}

/** Quota exhaustion is an interruption, not corrupt data (spec §10.6). */
export function isQuotaPaused(status: ImportJobStatus): boolean {
  return status === 'paused_provider_quota'
}
