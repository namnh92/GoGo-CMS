import { describe, expect, it } from 'vitest'
import { cmsPlaceEditSchema, mockContactWriteIssues } from '@/shared/api/cmsPlaceContract'
import { IMPORT_CANONICAL_FIELDS, MAPPABLE_FIELDS } from '@/shared/api/contracts-import'
import { buildImportTemplateCsv, TEMPLATE_COLUMNS } from '@/features/imports/importTemplate'
import { guessMapping } from '@/features/imports/csvPreview'
import { toReviewDraft, EMPTY_REVIEW_FORM } from '@/features/submissions/reviewForm'
import { toPlaceEditBody, type PlaceEditBaseline, type PlaceIdentityForm } from './placeForm'

/**
 * GoGo-BE#280 — what each CMS write path sends, held against the new contract.
 *
 * The oracle is `mockContactWriteIssues`, the mirror of GoGo-BE's
 * `planContactWrite`: a contact value written without independent evidence
 * comes back `provenance.<field> required`. These are the payload-shape checks
 * that fail against the console before this change (it sent bare values) and
 * pass after it.
 */

const LOADED = '2026-09-01T00:00:00.000Z'
const COLLECTED_LOCAL = '2026-09-30T09:00'

const stored: PlaceIdentityForm = {
  name: 'Chào Bạn Cafe & Space',
  addressText: '126 Nguyễn Thị Minh Khai',
  phone: '+842839301234',
  website: 'https://chaoban.cafe',
  description: '',
  areaKey: '',
  city: '',
  district: '',
  provinceCode: '',
  communeCode: '',
}

const baseline: PlaceEditBaseline = { values: stored, taxonomyIds: [], updatedAt: LOADED }

const evidence = {
  sourceType: 'editorial',
  sourceReference: 'Gọi chủ quán ngày 30/09',
  collectedAt: COLLECTED_LOCAL,
}
const none = { sourceType: '', sourceReference: '', collectedAt: '' }

describe('place editor body vs the GoGo-BE#280 contract', () => {
  it('sends evidence with a changed phone, and the server mirror accepts it', () => {
    const values = {
      ...stored,
      phone: '028 3822 9999',
      evidence: { addressText: none, phone: evidence, website: none },
    } as PlaceIdentityForm
    const body = toPlaceEditBody(values, [], baseline)

    expect(cmsPlaceEditSchema.safeParse(body).success).toBe(true)
    expect(mockContactWriteIssues(body, stored).issues).toEqual([])
    expect(body.provenance?.phone).toMatchObject({
      sourceType: 'editorial',
      sourceReference: 'Gọi chủ quán ngày 30/09',
    })
    // A zoned instant, never the box's wall-clock string.
    expect(body.provenance?.phone?.collectedAt).toMatch(/Z$/)
    expect(body.expectedUpdatedAt).toBe(LOADED)
  })

  it('sends evidence only for the values it writes', () => {
    const values = {
      ...stored,
      addressText: '1 Lê Duẩn',
      website: '',
      evidence: { addressText: evidence, phone: evidence, website: evidence },
    } as PlaceIdentityForm
    const body = toPlaceEditBody(values, [], baseline)

    // Unchanged phone: no value, no entry (`value_missing` otherwise). Cleared
    // website: `null`, no entry (`not_allowed` otherwise).
    expect(body.website).toBeNull()
    expect(Object.keys(body.provenance ?? {})).toEqual(['addressText'])
    expect(mockContactWriteIssues(body, stored).issues).toEqual([])
  })
})

describe('submission review draft vs the GoGo-BE#280 contract', () => {
  it('carries evidence for every contact value it holds', () => {
    const draft = toReviewDraft(
      { ...EMPTY_REVIEW_FORM, addressText: '1 Lê Duẩn', phone: '024 3456 7890' },
      null,
      // The third argument is the evidence the reviewer typed.
      { addressText: evidence, phone: evidence, website: none } as never,
    )
    // A draft is checked whole, against no stored row.
    expect(mockContactWriteIssues(draft as never, null).issues).toEqual([])
    expect(Object.keys(draft.provenance ?? {}).sort()).toEqual(['addressText', 'phone'])
  })
})

describe('import mapping vs the GoGo-BE#280 contract', () => {
  const EVIDENCE_COLUMNS = (['address', 'phone', 'website'] as const).flatMap((field) => [
    `${field}_source_type`,
    `${field}_source_reference`,
    `${field}_collected_at`,
  ])

  it('offers address and the nine evidence columns as mapping choices', () => {
    for (const field of ['address', ...EVIDENCE_COLUMNS]) {
      expect(IMPORT_CANONICAL_FIELDS as readonly string[], field).toContain(field)
      expect(MAPPABLE_FIELDS as readonly string[], field).toContain(field)
    }
  })

  it('guesses an evidence header as itself, not as a second value column', () => {
    const guessed = guessMapping(['address', 'phone', 'website', ...EVIDENCE_COLUMNS])
    for (const header of ['address', 'phone', 'website', ...EVIDENCE_COLUMNS]) {
      expect(guessed[header], header).toBe(header)
    }
  })

  it('teaches a template where every filled contact value has its evidence', () => {
    expect(TEMPLATE_COLUMNS as readonly string[]).toEqual(
      expect.arrayContaining(['address', ...EVIDENCE_COLUMNS]),
    )
    const [header, ...rows] = buildImportTemplateCsv()
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n')
      .map((line) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, '')))
    const col = (name: string) => header!.indexOf(name)
    for (const row of rows) {
      for (const field of ['address', 'phone', 'website']) {
        if (row[col(field)] === '') continue
        for (const part of ['source_type', 'source_reference', 'collected_at']) {
          expect(row[col(`${field}_${part}`)], `${field}_${part}`).not.toBe('')
        }
      }
    }
  })
})
