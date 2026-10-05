import { beforeEach, describe, expect, it } from 'vitest'
import { importJobs } from './fixtures'
import { mockDb, resetMockDb } from './handlers'

/**
 * Fable F-05 (CMS#228 @af0c2ef) — the default import handlers mirror GoGo-BE
 * `assertContactCurrent` / `refuseStaleContact` (BE#672 @cda3e2a,
 * `place-import-job.service.ts`): a decision on a row whose stored
 * address / phone / website no longer pass today's evidence rules is refused
 * `409 CONTACT_EVIDENCE_REQUIRED`, and the row is **persisted**
 * `validation_failed` with its column errors, counters moved — so a refetch
 * shows the failed row rather than the same actionable one.
 */

const JOB = importJobs[0]!.id
const EVIDENCE = {
  sourceType: 'editorial',
  sourceReference: 'Gọi chủ quán ngày 30/09',
  collectedAt: '2026-09-30T02:00:00.000Z',
}

type Envelope = { code: string; field_errors: { field: string; code: string }[] }
type Row = { id: string; status: string; errors: { code: string; field?: string | null }[] }

const post = (path: string, body: unknown) =>
  fetch(new URL(`/v1${path}`, window.location.origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
const get = (path: string) => fetch(new URL(`/v1${path}`, window.location.origin))

/** The stored row, to age it the way a pre-#280 parse left it. */
const stored = (rowId: string) => mockDb.importRows[JOB]!.find((row) => row.id === rowId)!

beforeEach(() => resetMockDb())

describe('F-05 — merge on a legacy contact row', () => {
  it('is refused 409 and the row is persisted validation_failed with its column errors', async () => {
    const response = await post(`/cms/place-imports/${JOB}/rows/row-14/merge`, {
      placeId: 'pl-chao-ban',
    })
    expect(response.status).toBe(409)
    const body = (await response.json()) as Envelope
    expect(body.code).toBe('CONTACT_EVIDENCE_REQUIRED')
    // One vocabulary with a fresh parse: the sheet's evidence columns.
    expect(body.field_errors).toEqual([
      expect.objectContaining({ field: 'address_source_type', code: 'ADDRESS_EVIDENCE_REQUIRED' }),
      expect.objectContaining({
        field: 'address_source_reference',
        code: 'ADDRESS_EVIDENCE_REQUIRED',
      }),
      expect.objectContaining({ field: 'address_collected_at', code: 'ADDRESS_EVIDENCE_REQUIRED' }),
    ])

    // Persisted: the refetch the console makes no longer offers the merge.
    const rows = (await (await get(`/cms/place-imports/${JOB}/rows`)).json()) as { items: Row[] }
    const row = rows.items.find((item) => item.id === 'row-14')!
    expect(row.status).toBe('validation_failed')
    expect(row.errors.map((error) => error.code)).toEqual([
      'ADDRESS_EVIDENCE_REQUIRED',
      'ADDRESS_EVIDENCE_REQUIRED',
      'ADDRESS_EVIDENCE_REQUIRED',
    ])
    const failed = (await (
      await get(`/cms/place-imports/${JOB}/rows?status=validation_failed`)
    ).json()) as { items: Row[] }
    expect(failed.items.map((item) => item.id)).toContain('row-14')

    // `refreshCounters`: one duplicate fewer, one validation failure more.
    const job = (await (await get(`/cms/place-imports/${JOB}`)).json()) as {
      rowsByStatus: Record<string, number>
      totals: { failed: number; processed: number; success: number }
    }
    expect(job.rowsByStatus).toMatchObject({ duplicate: 3, validation_failed: 1 })
    expect(job.totals).toMatchObject({ failed: 7, processed: 234, success: 210 })
  })

  it('refuses a second decision on the same row without counting it twice', async () => {
    await post(`/cms/place-imports/${JOB}/rows/row-14/merge`, { placeId: 'pl-chao-ban' })
    const again = await post(`/cms/place-imports/${JOB}/rows/row-14/merge`, {
      placeId: 'pl-chao-ban',
    })
    expect(again.status).toBe(409)
    const job = (await (await get(`/cms/place-imports/${JOB}`)).json()) as {
      rowsByStatus: Record<string, number>
      totals: { failed: number }
    }
    expect(job.rowsByStatus).toMatchObject({ duplicate: 3, validation_failed: 1 })
    expect(job.totals.failed).toBe(7)
  })

  it('fails a value that no longer passes today’s rules on its own column', async () => {
    const row = stored('row-14')
    row.normalized = {
      ...row.normalized,
      phone: 'abc',
      contactEvidence: { address_text: EVIDENCE, phone: EVIDENCE },
    }
    const response = await post(`/cms/place-imports/${JOB}/rows/row-14/merge`, {
      placeId: 'pl-chao-ban',
    })
    expect(response.status).toBe(409)
    const body = (await response.json()) as Envelope
    expect(body.field_errors).toEqual([
      expect.objectContaining({ field: 'phone', code: 'PHONE_INVALID' }),
    ])
    expect(row.status).toBe('validation_failed')
  })
})

describe('F-05 — confirm-candidate', () => {
  it('passes a row parsed after #280, and refuses the same row aged to a legacy one', async () => {
    const ok = await post(`/cms/place-imports/${JOB}/rows/row-12/confirm-candidate`, {
      googlePlaceId: 'ChIJ_cong_q3',
    })
    expect(ok.status).toBe(201)

    resetMockDb()
    const row = stored('row-12')
    delete (row.normalized as Record<string, unknown>).contactEvidence
    const refused = await post(`/cms/place-imports/${JOB}/rows/row-12/confirm-candidate`, {
      googlePlaceId: 'ChIJ_cong_q3',
    })
    expect(refused.status).toBe(409)
    expect(((await refused.json()) as Envelope).code).toBe('CONTACT_EVIDENCE_REQUIRED')
    // Checked before the candidate: nothing about the row's match was touched.
    expect(row.status).toBe('validation_failed')
    expect(row.candidates).toHaveLength(2)
    expect(row.resolvedGooglePlaceId).toBeNull()
  })
})

describe('F-05 — publish', () => {
  it('reports a legacy ready row failed instead of importing it', async () => {
    const row = stored('row-13')
    delete (row.normalized as Record<string, unknown>).contactEvidence
    const response = await post(`/cms/place-imports/${JOB}/publish`, {})
    expect(response.status).toBe(201)
    const result = (await response.json()) as { created: number; failed: unknown[] }
    expect(result.failed).toEqual([{ rowId: 'row-13', code: 'CONTACT_EVIDENCE_REQUIRED' }])
    expect(result.created).toBe(2)
    expect(row.status).toBe('validation_failed')
    expect(stored('row-17').status).toBe('imported')
  })
})
