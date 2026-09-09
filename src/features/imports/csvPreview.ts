import type { ImportCanonicalField } from '@/shared/api/contracts-import'

/**
 * Minimal RFC-4180 reader used ONLY to preview a CSV's headers and first rows
 * so the operator can map columns before the file is sent. The server is still
 * the authority on parsing, limits and format detection — this never decides
 * whether a file is valid.
 */
export type CsvPreview = { headers: string[]; sampleRows: string[][] }

const MAX_SAMPLE_ROWS = 3

export function parseCsvPreview(text: string): CsvPreview {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field.trim())
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(field.trim())
      field = ''
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
      if (rows.length > MAX_SAMPLE_ROWS) break
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field.trim())
    if (row.some((cell) => cell !== '')) rows.push(row)
  }

  const [headers = [], ...sampleRows] = rows
  return { headers, sampleRows: sampleRows.slice(0, MAX_SAMPLE_ROWS) }
}

/** Reads at most 64 KB — enough for headers plus a few rows of any real file. */
export async function readCsvPreview(file: File): Promise<CsvPreview> {
  const slice = file.slice(0, 64 * 1024)
  const text = await slice.text()
  return parseCsvPreview(text)
}

/**
 * Header text → canonical field. The key is always the **wire value** the
 * server accepts; the hints are only ever local aliases used to guess. Keeping
 * the two apart is the point: the previous version guessed toward a private
 * vocabulary (`googleMapsUrl`, `priceMin`) and three fields the server has no
 * column for, and the server silently dropped every one of them.
 *
 * `source_row_id` is not guessed at — the server derives it.
 */
const HEADER_HINTS: { field: ImportCanonicalField; hints: string[] }[] = [
  /*
   * PI-CMS-009 — first in the table, ahead of `name`.
   *
   * `name`'s hints include `place`, and "Google Place ID" contains it. Ordered
   * any lower, that header guesses onto `name` — wrong in the one column an
   * operator is least likely to re-check, because the guess looks plausible.
   */
  { field: 'google_place_id', hints: ['place id', 'place_id', 'placeid', 'ma dia diem google'] },
  { field: 'name', hints: ['name', 'ten', 'tên', 'place', 'địa điểm', 'dia diem'] },
  { field: 'city', hints: ['city', 'thanh pho', 'thành phố', 'tinh', 'tỉnh'] },
  { field: 'district', hints: ['district', 'quan', 'quận', 'huyen', 'huyện', 'khu vuc'] },
  /*
   * Ahead of `google_maps_url`, whose `google` hint would otherwise swallow the
   * header `google_maps_query` — the template writes both columns, so the two
   * have to be told apart by the more specific hint winning first.
   */
  { field: 'google_maps_query', hints: ['maps_query', 'tu khoa', 'từ khoá', 'từ khóa'] },
  { field: 'google_maps_url', hints: ['google', 'maps', 'link', 'url'] },
  { field: 'category', hints: ['category', 'loai', 'loại', 'nhom', 'nhóm'] },
  { field: 'price_min', hints: ['price_min', 'gia_min', 'giá thấp', 'min'] },
  { field: 'price_max', hints: ['price_max', 'gia_max', 'giá cao', 'max'] },
  { field: 'price_unit', hints: ['price_unit', 'don vi gia', 'đơn vị giá'] },
  { field: 'price_raw', hints: ['price_raw', 'khoang gia', 'khoảng giá'] },
  { field: 'audiences', hints: ['audiences', 'doi tuong', 'đối tượng'] },
  { field: 'audiences_raw', hints: ['di cung ai', 'đi cùng ai'] },
  { field: 'vibes', hints: ['vibes'] },
  { field: 'vibes_raw', hints: ['vibe', 'bau khong khi', 'bầu không khí'] },
  { field: 'highlight', hints: ['highlight', 'mon highlight', 'món highlight'] },
  // `note`, not `notes` — the singular is the canonical field, and a sheet
  // column called `notes` was being dropped for want of this alias.
  { field: 'note', hints: ['note', 'notes', 'ghi chu', 'ghi chú'] },
  // PI-BE-025 — GoGo's own facts, now columns rather than retired values.
  { field: 'phone', hints: ['phone', 'sdt', 'sđt', 'dien thoai', 'điện thoại'] },
  { field: 'website', hints: ['website', 'web'] },
  {
    field: 'avg_visit_minutes',
    hints: ['avg_visit', 'thoi luong', 'thời lượng', 'visit_minutes'],
  },
  { field: 'is_lodging', hints: ['is_lodging', 'luu tru', 'lưu trú'] },
  { field: 'curated_rank', hints: ['curated', 'thu tu', 'thứ tự'] },
]

/** Best-effort first guess. The operator always confirms before submitting. */
export function guessMapping(headers: string[]): Record<string, ImportCanonicalField> {
  const mapping: Record<string, ImportCanonicalField> = {}
  const taken = new Set<ImportCanonicalField>()
  for (const header of headers) {
    const normalized = header.toLowerCase().trim()
    for (const { field, hints } of HEADER_HINTS) {
      if (taken.has(field)) continue
      if (hints.some((hint) => normalized.includes(hint))) {
        mapping[header] = field
        taken.add(field)
        break
      }
    }
  }
  return mapping
}
