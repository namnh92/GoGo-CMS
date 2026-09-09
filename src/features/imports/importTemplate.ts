import type { ImportCanonicalField } from '@/shared/api/contracts-import'

/**
 * PI-CMS-009 — the file an operator should actually write.
 *
 * The wizard had no template at all. What existed was a spec example from
 * before Place IDs, before the GoGo-owned columns and before `city` stopped
 * being required, so every sheet in circulation was copied from something four
 * changes out of date — which is how `district` kept arriving in files long
 * after the tier it names was dissolved.
 *
 * Only columns the server supports today. Deprecated ones are still read on
 * upload for the sheets that already have them; they are not offered here,
 * because a template is an instruction and this one should not instruct anybody
 * to write a column GoGo will drop.
 */
export const TEMPLATE_COLUMNS = [
  'source_row_id',
  'name',
  'google_maps_url',
  'google_place_id',
  'google_maps_query',
  'city',
  'category',
  'price_min',
  'price_max',
  'price_unit',
  'audiences',
  'vibes',
  'highlight',
  'phone',
  'website',
  'avg_visit_minutes',
  'is_lodging',
  'curated_rank',
  'note',
] as const satisfies readonly ImportCanonicalField[]

/**
 * One row per identity mode the server accepts, because the modes are the part
 * an operator gets wrong: a sheet where every row repeats the same shape
 * teaches nothing about the three others.
 */
const EXAMPLE_ROWS: Record<(typeof TEMPLATE_COLUMNS)[number], string>[] = [
  {
    // Link only — the ordinary case. No city: the administrative identity comes
    // from the coordinate the link resolves to.
    source_row_id: 'HN-0001',
    name: 'Lotte Hotel Hanoi',
    google_maps_url: 'https://maps.app.goo.gl/a1guCisgtNTrvG4B6',
    google_place_id: '',
    google_maps_query: '',
    city: '',
    category: 'lodging',
    price_min: '',
    price_max: '',
    price_unit: '',
    audiences: 'couple',
    vibes: 'upscale',
    highlight: 'Bar tầng 67 nhìn toàn thành phố',
    phone: '024 3333 1000',
    website: 'lottehotel.com/hanoi-hotel',
    avg_visit_minutes: '120',
    is_lodging: 'true',
    curated_rank: '1',
    note: 'Đối tác ưu tiên',
  },
  {
    // Place ID only. Nothing else identifies the place, and nothing else has to:
    // the name comes from Google.
    source_row_id: 'HN-0002',
    name: '',
    google_maps_url: '',
    google_place_id: 'ChIJne3U7GyrNTERehxJ0V09C6o',
    google_maps_query: '',
    city: '',
    category: 'cafe',
    price_min: '35000',
    price_max: '80000',
    price_unit: 'per_person',
    audiences: 'couple|solo',
    vibes: 'cozy|quiet',
    highlight: '',
    phone: '',
    website: '',
    avg_visit_minutes: '',
    is_lodging: '',
    curated_rank: '',
    note: '',
  },
  {
    // Both, agreeing. The server expands the link and checks the two name the
    // same place; a disagreement fails the row with PLACE_ID_URL_MISMATCH.
    source_row_id: 'HN-0003',
    name: '',
    google_maps_url: 'https://www.google.com/maps?place_id=ChIJne3U7GyrNTERehxJ0V09C6o',
    google_place_id: 'ChIJne3U7GyrNTERehxJ0V09C6o',
    google_maps_query: '',
    city: '',
    category: 'cafe',
    price_min: '',
    price_max: '',
    price_unit: '',
    audiences: '',
    vibes: '',
    highlight: '',
    phone: '',
    website: '',
    avg_visit_minutes: '',
    is_lodging: '',
    curated_rank: '',
    note: '',
  },
  {
    // No identity at all — the fallback. This is the one row that needs `city`,
    // and it needs it as a search hint, not as an address.
    source_row_id: 'HN-0004',
    name: 'Cà phê Giảng',
    google_maps_url: '',
    google_place_id: '',
    google_maps_query: 'Cà phê Giảng Nguyễn Hữu Huân',
    city: 'Hà Nội',
    category: 'cafe',
    price_min: '20000',
    price_max: '60000',
    price_unit: 'per_person',
    audiences: 'couple|solo',
    vibes: 'cozy',
    highlight: 'Cà phê trứng bản gốc',
    phone: '',
    website: '',
    avg_visit_minutes: '45',
    is_lodging: 'false',
    curated_rank: '',
    note: '',
  },
]

/** RFC 4180: quote anything holding a comma, a quote or a newline. */
function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function buildImportTemplateCsv(): string {
  const header = TEMPLATE_COLUMNS.join(',')
  const rows = EXAMPLE_ROWS.map((row) => TEMPLATE_COLUMNS.map((c) => cell(row[c])).join(','))
  // A BOM, because the operators who open this open it in Excel, and Excel
  // reads a UTF-8 CSV without one as Latin-1 — which turns every Vietnamese
  // name in the examples into mojibake before they have typed anything.
  return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`
}
