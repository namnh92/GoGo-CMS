/**
 * GoGo-BE#737 — the label rule the CMS taxonomy API enforces (contract
 * 3.0.0-alpha.1): normalised first (NFC, every space separator to one ASCII
 * space, runs collapsed, edge spaces removed), then 1–80 code points of
 * letters, combining marks, digits, spaces and a short punctuation list.
 * Checked here so the editor hears it before sending; the API still decides.
 */
const ALLOWED = /^[\p{L}\p{M}\p{N} '"‘’“”()&+,./\-–—]{1,80}$/u

export function normaliseLabel(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\p{Zs}/gu, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/^ +| +$/g, '')
}

/** True when a label the editor typed would be refused. An empty label is for the caller. */
export function labelBreaksRule(raw: string): boolean {
  const label = normaliseLabel(raw)
  return label !== '' && !ALLOWED.test(label)
}
