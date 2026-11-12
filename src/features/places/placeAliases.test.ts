import { describe, expect, it } from 'vitest'
import { cmsPlaceDetailSchema } from '@/shared/api/contracts'
import { places } from '@/shared/test/fixtures'
import { aliasEvidenceIssues, placeAliasesSchema } from './placeAliases'
import {
  diffAgainstServer,
  placeIdentitySchema,
  splitFieldErrors,
  toPlaceEditBody,
  type PlaceIdentityForm,
} from './placeForm'

const values: PlaceIdentityForm = {
  name: 'Chào Bạn',
  aliases: ['CB'],
  sourceReferences: {},
  aliasProvenance: {
    sourceType: 'editorial',
    sourceReference: ' Merchant interview ',
    collectedAt: '2026-08-01T10:00',
  },
}
const baseline = { values, taxonomyIds: [], updatedAt: '2026-08-02T00:00:00.000Z' }

describe('alias contract and form', () => {
  it('preserves aliases when parsing the read DTO', () => {
    expect(cmsPlaceDetailSchema.parse({ ...places[0], aliases: ['CB'] }).aliases).toEqual(['CB'])
  })

  it('accepts boundary values and rejects every out-of-bounds/plain-text violation', () => {
    expect(
      placeAliasesSchema.safeParse(Array.from({ length: 20 }, () => 'a'.repeat(120))).success,
    ).toBe(true)
    for (const aliases of [
      Array.from({ length: 21 }, () => 'CB'),
      ['a'.repeat(121)],
      [''],
      ['  '],
      ['\u0301'],
      ['CB\n'],
      ['CB\u200b'],
      ['CB\u2028'],
    ]) {
      expect(placeAliasesSchema.safeParse(aliases).success, JSON.stringify(aliases)).toBe(false)
    }
    expect(placeIdentitySchema.safeParse({ ...values, aliasDraft: 'Not added' }).success).toBe(
      false,
    )
  })

  it('sends a whole replacement and evidence with the loaded version, including clear', () => {
    for (const aliases of [['CB', 'Chao Ban'], []]) {
      const body = toPlaceEditBody({ ...values, aliases }, [], baseline)
      expect(body).toEqual({
        aliases,
        aliasProvenance: {
          sourceType: 'editorial',
          sourceReference: 'Merchant interview',
          collectedAt: new Date('2026-08-01T10:00').toISOString(),
        },
        expectedUpdatedAt: baseline.updatedAt,
      })
    }
    expect(
      diffAgainstServer({ ...values, aliases: ['A,B', 'C'] }, { ...values, aliases: ['A', 'B,C'] }),
    ).toContainEqual({
      field: 'aliases',
      mine: '["A,B","C"]',
      theirs: '["A","B,C"]',
    })
    expect(toPlaceEditBody(values, [], baseline)).not.toHaveProperty('aliases')
    expect(toPlaceEditBody(values, [], baseline)).not.toHaveProperty('aliasProvenance')
  })

  it('requires reference and collection time for a replacement, with bounded dates and references', () => {
    const now = new Date('2026-08-02T00:00:00Z')
    expect(aliasEvidenceIssues(undefined, now).map((issue) => issue.field)).toEqual([
      'aliasProvenance.sourceReference',
      'aliasProvenance.collectedAt',
    ])
    expect(aliasEvidenceIssues(values.aliasProvenance, now)).toEqual([])
    for (const [property, value, code] of [
      ['sourceReference', 'x'.repeat(501), 'too_long'],
      ['collectedAt', 'bad-date', 'invalid_datetime'],
      ['collectedAt', '2026-08-02T00:05:01Z', 'in_future'],
    ]) {
      expect(
        aliasEvidenceIssues({ ...values.aliasProvenance!, [property!]: value }, now),
      ).toContainEqual({ field: `aliasProvenance.${property}`, code, message: '' })
    }
  })

  it('maps list, indexed aliases and provenance errors without dropping unknown paths', () => {
    const paths = [
      'aliases',
      'aliases.2',
      'aliasProvenance',
      'aliasProvenance.sourceReference',
      'aliasProvenance.collectedAt',
      'aliasProvenance.sourceType',
      'unknown',
    ]
    const result = splitFieldErrors(
      paths.map((field) => ({ field, code: 'required', message: '' })),
    )
    expect(result.mapped.map((issue) => issue.field)).toEqual([
      'aliases',
      'aliases',
      'aliasProvenance.sourceReference',
      'aliasProvenance.sourceReference',
      'aliasProvenance.collectedAt',
      'aliasProvenance.sourceType',
    ])
    expect(result.unmapped.map((issue) => issue.field)).toEqual(['unknown'])
  })
})
