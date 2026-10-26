/**
 * Line diff for the GoGo guide (version history, publish preview, edit
 * conflicts). A plain longest-common-subsequence over lines: guide documents
 * are prose of a few hundred lines, so the quadratic table is small, and above
 * the cap the diff says it is too large rather than freezing the tab.
 */
export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

export type LineDiff =
  | { tooLarge: false; lines: DiffLine[]; added: number; removed: number }
  | { tooLarge: true; added: number; removed: number }

/** Cells of the LCS table we are willing to fill (≈ 2000 × 2000 lines). */
const MAX_CELLS = 4_000_000

function splitLines(text: string): string[] {
  if (text === '') return []
  return text.replace(/\r\n/g, '\n').split('\n')
}

export function diffLines(before: string, after: string): LineDiff {
  const a = splitLines(before)
  const b = splitLines(after)

  // Trim the common head and tail first: an edit to one paragraph should not
  // pay for the whole document.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }

  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const n = midA.length
  const m = midB.length

  if ((n + 1) * (m + 1) > MAX_CELLS) {
    return { tooLarge: true, added: m, removed: n }
  }

  // lcs[i][j] = LCS length of midA[i..] and midB[j..], flattened.
  const width = m + 1
  const lcs = new Uint32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        midA[i] === midB[j]
          ? lcs[(i + 1) * width + j + 1]! + 1
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!)
    }
  }

  const lines: DiffLine[] = a.slice(0, start).map((text) => ({ kind: 'same', text }))
  let i = 0
  let j = 0
  let added = 0
  let removed = 0
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      lines.push({ kind: 'same', text: midA[i]! })
      i += 1
      j += 1
    } else if (lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!) {
      lines.push({ kind: 'removed', text: midA[i]! })
      removed += 1
      i += 1
    } else {
      lines.push({ kind: 'added', text: midB[j]! })
      added += 1
      j += 1
    }
  }
  for (; i < n; i += 1) {
    lines.push({ kind: 'removed', text: midA[i]! })
    removed += 1
  }
  for (; j < m; j += 1) {
    lines.push({ kind: 'added', text: midB[j]! })
    added += 1
  }
  for (const text of a.slice(endA)) lines.push({ kind: 'same', text })

  return { tooLarge: false, lines, added, removed }
}

/**
 * Collapses long unchanged runs to a marker, keeping `context` lines around
 * each change — the reader is looking for what moved, not rereading the guide.
 */
export type DiffRow = DiffLine | { kind: 'skip'; count: number }

export function withContext(lines: DiffLine[], context = 2): DiffRow[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((line, index) => {
    if (line.kind === 'same') return
    for (
      let k = Math.max(0, index - context);
      k <= Math.min(lines.length - 1, index + context);
      k++
    )
      keep[k] = true
  })
  const rows: DiffRow[] = []
  let skipped = 0
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (skipped > 0) rows.push({ kind: 'skip', count: skipped })
      skipped = 0
      rows.push(line)
    } else {
      skipped += 1
    }
  })
  if (skipped > 0) rows.push({ kind: 'skip', count: skipped })
  return rows
}
