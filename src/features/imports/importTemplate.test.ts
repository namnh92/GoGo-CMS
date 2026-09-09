import { describe, expect, it } from 'vitest'
import {
  IMPORT_CANONICAL_FIELDS,
  MAPPABLE_FIELDS,
  RETIRED_MAPPABLE_FIELDS,
  isCanonicalField,
} from '@/shared/api/contracts-import'
import { buildImportTemplateCsv, TEMPLATE_COLUMNS } from './importTemplate'
import { guessMapping } from './csvPreview'
import { en } from '@/shared/i18n/en'
import { vi } from '@/shared/i18n/vi'

/**
 * PI-CMS-009 — the template is an instruction, so it must not instruct anybody
 * to write a column GoGo will drop.
 */
describe('the published import template', () => {
  const csv = buildImportTemplateCsv()
  const lines = csv
    .replace(/^\uFEFF/, '')
    .trim()
    .split('\r\n')
  const header = lines[0]!.split(',')

  it('offers only columns the server supports today', () => {
    for (const column of TEMPLATE_COLUMNS) {
      expect(isCanonicalField(column), column).toBe(true)
      expect(RETIRED_MAPPABLE_FIELDS, column).not.toContain(column)
    }
  })

  it('leaves out every column deprecated for new files', () => {
    for (const gone of [
      'district',
      'category_raw',
      'price_raw',
      'audiences_raw',
      'vibes_raw',
      'address',
    ]) {
      expect(header, gone).not.toContain(gone)
    }
  })

  it('exposes audiences and never raw suitability JSON', () => {
    /*
     * `audiences` is the operator-facing vocabulary for who a place suits;
     * `places.suitability` is the weighted score GoGo derives from it. Asking a
     * spreadsheet to author both would be asking one person to write the same
     * fact at two levels of abstraction and keep them consistent.
     */
    expect(header).toContain('audiences')
    expect(header).not.toContain('suitability')
    // And no example row smuggles the object in under another column.
    expect(csv).not.toContain('"couple"')
    expect(csv).not.toContain('{')
  })

  it('carries the Place ID column and the GoGo-owned ones', () => {
    for (const column of [
      'google_place_id',
      'phone',
      'website',
      'avg_visit_minutes',
      'is_lodging',
      'curated_rank',
    ]) {
      expect(header, column).toContain(column)
    }
  })

  it('shows one row per identity mode, because that is what gets written wrong', () => {
    const rows = lines.slice(1).map((line) => {
      // Naive split is enough: the only quoted cell is the suitability JSON,
      // and this assertion only reads the identity columns before it.
      const cells = line.split(',')
      return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))
    })
    expect(rows).toHaveLength(4)

    // Link only.
    expect(rows[0]!.google_maps_url).toMatch(/^https:\/\/maps\.app\.goo\.gl\//)
    expect(rows[0]!.google_place_id).toBe('')
    // Place ID only.
    expect(rows[1]!.google_maps_url).toBe('')
    expect(rows[1]!.google_place_id).toBeTruthy()
    // Both, agreeing — the URL names the same id the column does.
    expect(rows[2]!.google_maps_url).toContain(rows[2]!.google_place_id!)
    // Name/query fallback: the one row that needs a city, as a search hint.
    expect(rows[3]!.google_maps_url).toBe('')
    expect(rows[3]!.google_place_id).toBe('')
    expect(rows[3]!.google_maps_query).toBeTruthy()
    expect(rows[3]!.city).toBeTruthy()

    // The three identified rows need no city at all.
    for (const row of rows.slice(0, 3)) expect(row.city).toBe('')
  })

  it('starts with a BOM, because these files are opened in Excel', () => {
    // Without it Excel reads UTF-8 as Latin-1 and every Vietnamese name in the
    // examples is mojibake before the operator has typed anything.
    expect(csv.startsWith('\uFEFF')).toBe(true)
  })

  it('maps back onto itself — every template header auto-detects', () => {
    const mapping = guessMapping([...TEMPLATE_COLUMNS])
    for (const column of TEMPLATE_COLUMNS) {
      // `source_row_id` is derived from row position and is deliberately not
      // guessable: offering to map it would put a requirement back on the
      // operator that the server already removed.
      if (column === 'source_row_id') continue
      expect(mapping[column], column).toBe(column)
    }
  })
})

describe('the mapping vocabulary', () => {
  it('offers the new columns and hides the deprecated ones', () => {
    for (const offered of [
      'google_place_id',
      'phone',
      'website',
      'avg_visit_minutes',
      'is_lodging',
      'curated_rank',
    ]) {
      expect(MAPPABLE_FIELDS, offered).toContain(offered)
    }
    // `suitability` is not a column at all — not offered, not canonical.
    expect(MAPPABLE_FIELDS as readonly string[]).not.toContain('suitability')
    for (const hidden of ['district', 'category_raw', 'price_raw', 'audiences_raw', 'vibes_raw']) {
      expect(MAPPABLE_FIELDS, hidden).not.toContain(hidden)
      // Still canonical: a sheet that already has the column still uploads.
      expect(IMPORT_CANONICAL_FIELDS, hidden).toContain(hidden)
    }
  })

  it('guesses a Place ID header onto the id, not onto the URL', () => {
    // "Google Place ID" contains "google", so a hint table ordered the other way
    // would map it to `google_maps_url` — wrong in the one place an operator is
    // least likely to check.
    expect(guessMapping(['Google Place ID'])['Google Place ID']).toBe('google_place_id')
    expect(guessMapping(['Link Google Maps'])['Link Google Maps']).toBe('google_maps_url')
  })

  it('never names a column the file cannot carry', () => {
    // The job detail screen tells an operator which values came out of their
    // file. `suitability` is a score GoGo derives, has never been an import
    // column, and listing it there invites a column the server will refuse.
    for (const dictionary of [vi, en]) {
      const copy = dictionary['jobDetail.sourceFileFields']
      expect(copy).not.toContain('suitability')
      expect(copy).toContain('audiences')
    }
  })

  it('guesses the Vietnamese headers an operator actually types', () => {
    expect(guessMapping(['Số điện thoại'])['Số điện thoại']).toBe('phone')
    expect(guessMapping(['Website'])['Website']).toBe('website')
    expect(guessMapping(['Thời lượng ghé'])['Thời lượng ghé']).toBe('avg_visit_minutes')
    expect(guessMapping(['Lưu trú'])['Lưu trú']).toBe('is_lodging')
  })
})
