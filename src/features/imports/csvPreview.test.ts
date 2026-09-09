import { describe, expect, it } from 'vitest'
import { guessMapping, parseCsvPreview } from './csvPreview'
import {
  IMPORT_CANONICAL_FIELDS,
  MAPPABLE_FIELDS,
  RETIRED_MAPPABLE_FIELDS,
  SYSTEM_DERIVED_FIELDS,
  isCanonicalField,
} from '@/shared/api/contracts-import'

describe('csv preview', () => {
  it('handles quoted cells containing the delimiter', () => {
    const preview = parseCsvPreview('ten,dia chi\n"Chào Bạn","126 NTMK, Q.3"\n')
    expect(preview.headers).toEqual(['ten', 'dia chi'])
    expect(preview.sampleRows[0]).toEqual(['Chào Bạn', '126 NTMK, Q.3'])
  })

  it('keeps a quoted Google URL whole, commas and all', () => {
    /*
     * A `/maps/place/…/@lat,lng,zoom` URL carries two commas. Split on them and
     * the row still imports — with a truncated link that resolves to something
     * else or to nothing, which is worse than a rejected file because nothing
     * says it happened. Real sheets quote it; the parser has to honour that.
     */
    const csv = [
      'name,google_maps_url,google_place_id',
      'Vincom Plaza Biên Hòa,"https://www.google.com/maps/place/Vincom/@10.9483,106.8225,16z",ChIJsQehRCDcdDERzh8HEarjgfE',
      'GO! Nha Trang,,ChIJWSyhWnddcDERnSHL-cXjM6Q',
    ].join('\r\n')
    const preview = parseCsvPreview(csv)

    expect(preview.headers).toEqual(['name', 'google_maps_url', 'google_place_id'])
    expect(preview.sampleRows[0]![1]).toBe(
      'https://www.google.com/maps/place/Vincom/@10.9483,106.8225,16z',
    )
    // Three columns on both rows: a split URL would have made the first row
    // five cells wide and shifted the Place ID out of its column.
    expect(preview.sampleRows[0]).toHaveLength(3)
    expect(preview.sampleRows[1]).toEqual(['GO! Nha Trang', '', 'ChIJWSyhWnddcDERnSHL-cXjM6Q'])
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
    // `address` was offered by the old wizard and silently discarded by the
    // server. `phone` and `website` were too, until PI-BE-025 gave them columns.
    const guessed = Object.values(guessMapping(['dia chi', 'so dien thoai', 'website', 'ten quan']))
    for (const field of guessed) expect(isCanonicalField(field)).toBe(true)
    expect(guessed).not.toContain('address')
    // Now stored rather than dropped, so guessing them is the right answer.
    expect(guessed).toContain('phone')
    expect(guessed).toContain('website')
  })

  it('never guesses a system-derived field', () => {
    // `source_row_id` comes from row position; offering to map it would put a
    // requirement back on the operator that the server already removed.
    const guessed = Object.values(guessMapping(['source_row_id', 'id', 'stt']))
    for (const field of SYSTEM_DERIVED_FIELDS) expect(guessed).not.toContain(field)
  })
})

describe('canonical mapping vocabulary', () => {
  it('offers every canonical field except the system-derived and retired ones', () => {
    expect(MAPPABLE_FIELDS).toEqual(
      IMPORT_CANONICAL_FIELDS.filter(
        (f) => !SYSTEM_DERIVED_FIELDS.includes(f) && !RETIRED_MAPPABLE_FIELDS.includes(f),
      ),
    )
    expect(MAPPABLE_FIELDS).not.toContain('source_row_id')
  })

  it('no longer offers district, while still accepting it on the wire (ADM-107)', () => {
    // The tier was dissolved on 2025-07-01. Offering it in the mapping step
    // tells an operator that GoGo files places under districts, which is the
    // thing that stopped being true.
    expect(MAPPABLE_FIELDS).not.toContain('district')
    // Still canonical, because a legacy sheet has the column and the server
    // reads it as historical name evidence — that is a different question from
    // whether an operator should be asked to choose it.
    expect(isCanonicalField('district')).toBe(true)
    expect(IMPORT_CANONICAL_FIELDS).toContain('district')
  })

  it('carries the fields the old hand-written list was missing', () => {
    for (const field of [
      'price_unit',
      'audiences',
      'vibes',
      'highlight',
      'google_maps_query',
    ] as const) {
      expect(MAPPABLE_FIELDS).toContain(field)
    }
  })

  it('stops offering the legacy free-text columns while still accepting them', () => {
    // PI-CMS-009. Each exists to read a sheet nobody writes any more: the two
    // `*_raw` lists and `price_raw` are parsed into the keyed columns beside
    // them, and `category_raw` needs an editor to map a string GoGo has no key
    // for. The server still reads all four, so an old file uploads unchanged.
    for (const field of ['category_raw', 'price_raw', 'audiences_raw', 'vibes_raw'] as const) {
      expect(MAPPABLE_FIELDS, field).not.toContain(field)
      expect(IMPORT_CANONICAL_FIELDS, field).toContain(field)
    }
  })

  it('drops the one field the server still never accepts', () => {
    // `address_text` comes from the provider's formatted address; a sheet's own
    // address string has no writer beside it. `phone` and `website` left this
    // list in PI-BE-025, when they got columns.
    expect(isCanonicalField('address')).toBe(false)
    expect(isCanonicalField('phone')).toBe(true)
    expect(isCanonicalField('website')).toBe(true)
  })

  it('emits no legacy camelCase wire value anywhere', () => {
    // The server still normalises these for older `/v1` callers, but this
    // client must never be one of them — compatibility is for clients that
    // cannot be updated, and this one just was.
    const legacy = ['googleMapsUrl', 'priceMin', 'priceMax', 'address']
    for (const value of legacy) {
      expect(IMPORT_CANONICAL_FIELDS as readonly string[]).not.toContain(value)
      expect(MAPPABLE_FIELDS as readonly string[]).not.toContain(value)
    }
    // Every value this client can put on the wire is canonical snake_case.
    for (const field of MAPPABLE_FIELDS) {
      expect(field).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(isCanonicalField(field)).toBe(true)
    }
  })
})
