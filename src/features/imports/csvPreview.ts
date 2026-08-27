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

const HEADER_HINTS: Record<string, string[]> = {
  name: ['name', 'ten', 'tên', 'place', 'địa điểm', 'dia diem'],
  address: ['address', 'dia chi', 'địa chỉ', 'diachi'],
  city: ['city', 'thanh pho', 'thành phố', 'tinh', 'tỉnh'],
  district: ['district', 'quan', 'quận', 'huyen', 'huyện'],
  googleMapsUrl: ['google', 'maps', 'link', 'url'],
  category: ['category', 'loai', 'loại', 'nhom', 'nhóm'],
  priceMin: ['price_min', 'gia_min', 'giá thấp', 'min'],
  priceMax: ['price_max', 'gia_max', 'giá cao', 'max'],
  phone: ['phone', 'sdt', 'điện thoại', 'dien thoai'],
  website: ['website', 'web', 'site'],
  note: ['note', 'ghi chu', 'ghi chú'],
}

/** Best-effort first guess. The operator always confirms before submitting. */
export function guessMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  const taken = new Set<string>()
  for (const header of headers) {
    const normalized = header.toLowerCase().trim()
    for (const [field, hints] of Object.entries(HEADER_HINTS)) {
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
