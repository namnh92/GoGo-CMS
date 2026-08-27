import { z } from 'zod'

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
  unmappedHeaders: z.array(z.string()).default([]),
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
  errors: z.array(ingestMessageSchema).default([]),
  warnings: z.array(ingestMessageSchema).default([]),
})

export const importPublishResultSchema = z.object({
  jobId: z.string(),
  created: z.number().int().default(0),
  failed: z.array(z.object({ rowId: z.string(), code: z.string() })).default([]),
})
export type ImportPublishResult = z.infer<typeof importPublishResultSchema>

/** Canonical fields a source column can be mapped onto (spec §9.2). */
export const MAPPABLE_FIELDS = [
  { field: 'name', required: true },
  { field: 'address', required: true },
  { field: 'city', required: false },
  { field: 'district', required: false },
  { field: 'googleMapsUrl', required: false },
  { field: 'category', required: false },
  { field: 'priceMin', required: false },
  { field: 'priceMax', required: false },
  { field: 'phone', required: false },
  { field: 'website', required: false },
  { field: 'note', required: false },
] as const

export type MappableField = (typeof MAPPABLE_FIELDS)[number]['field']

/** A job is still moving — the detail screen polls while this is true. */
export function isJobLive(status: ImportJobStatus): boolean {
  return status === 'uploaded' || status === 'validating' || status === 'processing'
}

/** Quota exhaustion is an interruption, not corrupt data (spec §10.6). */
export function isQuotaPaused(status: ImportJobStatus): boolean {
  return status === 'paused_provider_quota'
}
