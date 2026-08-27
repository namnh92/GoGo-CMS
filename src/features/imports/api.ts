import { apiFetch, apiFetchParsed, newIdempotencyKey } from '@/shared/api/client'
import {
  importJobListSchema,
  importJobSchema,
  importPublishResultSchema,
  importRowDecisionSchema,
  importRowListSchema,
  type ImportJob,
  type ImportMode,
  type ImportRowStatus,
} from '@/shared/api/contracts-import'

export function fetchImportJobs(offset: number, limit: number, signal?: AbortSignal) {
  return apiFetchParsed(importJobListSchema, '/cms/place-imports', {
    query: { offset, limit },
    signal,
  })
}

export function fetchImportJob(jobId: string, signal?: AbortSignal): Promise<ImportJob> {
  return apiFetchParsed(importJobSchema, `/cms/place-imports/${jobId}`, { signal })
}

export function fetchImportRows(
  jobId: string,
  status: ImportRowStatus | 'all',
  offset: number,
  limit: number,
  signal?: AbortSignal,
) {
  return apiFetchParsed(importRowListSchema, `/cms/place-imports/${jobId}/rows`, {
    query: { status: status === 'all' ? undefined : status, offset, limit },
    signal,
  })
}

export type CreateFileImportInput = {
  file: File
  mode: ImportMode
  defaultCity?: string
  /** Raw header → canonical field. Sent as a JSON string per the spec. */
  mapping?: Record<string, string>
}

export function createFileImport(input: CreateFileImportInput): Promise<ImportJob> {
  const form = new FormData()
  form.append('file', input.file)
  form.append('mode', input.mode)
  if (input.defaultCity) form.append('defaultCity', input.defaultCity)
  if (input.mapping && Object.keys(input.mapping).length > 0) {
    form.append('mapping', JSON.stringify(input.mapping))
  }
  return apiFetchParsed(importJobSchema, '/cms/place-imports', { method: 'POST', body: form })
}

export type CreateSheetImportInput = {
  spreadsheetUrl: string
  sheets?: string[]
  mode: ImportMode
  defaultCity?: string
  tabCityMapping?: Record<string, string>
  mapping?: Record<string, string>
}

export function createSheetImport(input: CreateSheetImportInput): Promise<ImportJob> {
  return apiFetchParsed(importJobSchema, '/cms/place-imports/google-sheet', {
    method: 'POST',
    body: input,
  })
}

/** Also the resume path for a job parked at `paused_provider_quota`. */
export function startImport(jobId: string): Promise<ImportJob> {
  return apiFetchParsed(importJobSchema, `/cms/place-imports/${jobId}/start`, {
    method: 'POST',
    idempotencyKey: newIdempotencyKey(),
  })
}

/** Stops unprocessed chunks only — imported rows are never rolled back. */
export function cancelImport(jobId: string): Promise<ImportJob> {
  return apiFetchParsed(importJobSchema, `/cms/place-imports/${jobId}/cancel`, {
    method: 'POST',
    idempotencyKey: newIdempotencyKey(),
  })
}

export function retryImport(jobId: string): Promise<ImportJob> {
  return apiFetchParsed(importJobSchema, `/cms/place-imports/${jobId}/retry`, {
    method: 'POST',
    idempotencyKey: newIdempotencyKey(),
  })
}

/** Only a googlePlaceId the resolver surfaced on this row is accepted. */
export function confirmCandidate(jobId: string, rowId: string, googlePlaceId: string) {
  return apiFetchParsed(
    importRowDecisionSchema,
    `/cms/place-imports/${jobId}/rows/${rowId}/confirm-candidate`,
    { method: 'POST', body: { googlePlaceId }, idempotencyKey: newIdempotencyKey() },
  )
}

export function mergeImportRow(jobId: string, rowId: string, placeId: string) {
  return apiFetchParsed(
    importRowDecisionSchema,
    `/cms/place-imports/${jobId}/rows/${rowId}/merge`,
    {
      method: 'POST',
      body: { placeId },
      idempotencyKey: newIdempotencyKey(),
    },
  )
}

export function skipImportRow(jobId: string, rowId: string) {
  return apiFetchParsed(importRowDecisionSchema, `/cms/place-imports/${jobId}/rows/${rowId}/skip`, {
    method: 'POST',
    idempotencyKey: newIdempotencyKey(),
  })
}

/** Ops-only: creates catalog places from the ready rows. */
export function publishImport(jobId: string, rowIds?: string[]) {
  return apiFetchParsed(importPublishResultSchema, `/cms/place-imports/${jobId}/publish`, {
    method: 'POST',
    body: rowIds && rowIds.length > 0 ? { rowIds } : {},
    idempotencyKey: newIdempotencyKey(),
  })
}

export async function downloadErrorReport(jobId: string, fileName: string): Promise<void> {
  const blob = await apiFetch<Blob>(`/cms/place-imports/${jobId}/error-report`, { raw: true })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
