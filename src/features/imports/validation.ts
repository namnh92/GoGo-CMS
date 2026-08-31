import type { ImportRowStatus } from '@/shared/api/contracts-import'

/**
 * Validation outcome per row, rolled up from `ImportRowStatus`.
 *
 * The nine row statuses answer two different questions at once: *where is this
 * row in the pipeline* and *what did validation make of it*. The counters care
 * about the second, so the map is exhaustive and explicit — a status that is
 * still in flight buckets to `null` rather than being quietly counted as a
 * warning, which would overstate the problems in the file.
 */
export type ValidationBucket = 'valid' | 'warning' | 'error' | 'duplicate'

export const ROW_STATUS_BUCKET: Record<ImportRowStatus, ValidationBucket | null> = {
  ready: 'valid',
  imported: 'valid',
  needs_confirmation: 'warning',
  duplicate: 'duplicate',
  validation_failed: 'error',
  unresolved: 'error',
  failed: 'error',
  // Still moving: counted as in-flight, never as an outcome.
  pending: null,
  resolving: null,
}

export const VALIDATION_BUCKETS: ValidationBucket[] = ['valid', 'warning', 'error', 'duplicate']

/**
 * Counts come from `ImportJob.rowsByStatus`, which the server computes over the
 * whole job. Deriving them from the paginated row list would count one page and
 * present it as the file's verdict.
 */
export function bucketCounts(rowsByStatus: Record<string, number>): {
  buckets: Record<ValidationBucket, number>
  inFlight: number
  counted: number
} {
  const buckets: Record<ValidationBucket, number> = {
    valid: 0,
    warning: 0,
    error: 0,
    duplicate: 0,
  }
  let inFlight = 0
  let counted = 0
  for (const [status, rawCount] of Object.entries(rowsByStatus)) {
    const count = Number.isFinite(rawCount) ? rawCount : 0
    counted += count
    // An unknown status means the server grew one: count it as in-flight
    // rather than dropping it, so the totals still add up.
    const bucket = ROW_STATUS_BUCKET[status as ImportRowStatus]
    if (bucket === undefined || bucket === null) inFlight += count
    else buckets[bucket] += count
  }
  return { buckets, inFlight, counted }
}
