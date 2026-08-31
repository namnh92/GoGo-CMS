import { describe, expect, it } from 'vitest'
import { guessMapping, parseCsvPreview } from './csvPreview'
import {
  IMPORT_CANONICAL_FIELDS,
  MAPPABLE_FIELDS,
  SYSTEM_DERIVED_FIELDS,
  isCanonicalField,
} from '@/shared/api/contracts-import'

describe('csv preview', () => {
  it('handles quoted cells containing the delimiter', () => {
    const preview = parseCsvPreview('ten,dia chi\n"Chào Bạn","126 NTMK, Q.3"\n')
    expect(preview.headers).toEqual(['ten', 'dia chi'])
    expect(preview.sampleRows[0]).toEqual(['Chào Bạn', '126 NTMK, Q.3'])
  })

  it('guesses Vietnamese headers onto the wire values the server accepts', () => {
    const mapping = guessMapping(['ten quan', 'link google maps', 'khoang gia'])
    expect(mapping['ten quan']).toBe('name')
    // snake_case, exactly as it goes on the wire — there is no camelCase
    // translation layer any more, because the server rejected that vocabulary.
    expect(mapping['link google maps']).toBe('google_maps_url')
    expect(mapping['khoang gia']).toBe('price_raw')
  })

  it('maps a `notes` column onto `note`', () => {
    // The real HCM sheet had `notes`; the singular is the canonical field, and
    // the plural used to be dropped for want of this alias.
    expect(guessMapping(['notes'])).toEqual({ notes: 'note' })
  })

  it('leaves unknown columns unmapped rather than guessing wildly', () => {
    expect(guessMapping(['cot_la'])).toEqual({})
  })

  it('never guesses a field the server has no column for', () => {
    // `address`, `phone` and `website` were offered by the old wizard and
    // silently discarded by the server.
    const guessed = Object.values(guessMapping(['dia chi', 'so dien thoai', 'website', 'ten quan']))
    for (const field of guessed) expect(isCanonicalField(field)).toBe(true)
    expect(guessed).not.toContain('address')
    expect(guessed).not.toContain('phone')
    expect(guessed).not.toContain('website')
  })

  it('never guesses a system-derived field', () => {
    // `source_row_id` comes from row position; offering to map it would put a
    // requirement back on the operator that the server already removed.
    const guessed = Object.values(guessMapping(['source_row_id', 'id', 'stt']))
    for (const field of SYSTEM_DERIVED_FIELDS) expect(guessed).not.toContain(field)
  })
})

describe('canonical mapping vocabulary', () => {
  it('offers every canonical field except the system-derived ones', () => {
    expect(MAPPABLE_FIELDS).toEqual(
      IMPORT_CANONICAL_FIELDS.filter((f) => !SYSTEM_DERIVED_FIELDS.includes(f)),
    )
    expect(MAPPABLE_FIELDS).not.toContain('source_row_id')
  })

  it('carries the fields the old hand-written list was missing', () => {
    for (const field of [
      'category_raw',
      'price_unit',
      'price_raw',
      'audiences',
      'audiences_raw',
      'vibes',
      'vibes_raw',
      'highlight',
      'google_maps_query',
    ] as const) {
      expect(MAPPABLE_FIELDS).toContain(field)
    }
  })

  it('drops the three fields the server never accepted', () => {
    for (const field of ['address', 'phone', 'website']) {
      expect(isCanonicalField(field)).toBe(false)
    }
  })
})
