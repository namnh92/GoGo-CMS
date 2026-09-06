export const styles = {
  wrap: 'flex flex-col gap-4',
  groupTitle: 'text-xs font-semibold uppercase tracking-wide text-text-muted',
  groupHint: 'mt-0.5 mb-2 text-xs text-text-subtle',
  list: 'divide-y divide-line rounded-compact border border-line',
  row: 'flex items-center gap-2 px-2.5 py-2',
  markMet: 'w-4 shrink-0 text-center text-sm font-bold text-mint',
  markUnmet: 'w-4 shrink-0 text-center text-sm text-text-subtle',
  label: 'min-w-0 flex-1 truncate text-[13px] text-text',
  freshness: 'mt-2 text-[11px] text-text-subtle',
  blocked: 'flex items-start gap-1 text-xs font-medium text-danger',

  geoGrid: 'mb-3 flex flex-col gap-2 rounded-compact border border-line bg-surface-sunken p-3',
  geoLabel: 'text-[11px] font-semibold uppercase tracking-wide text-text-muted',
  geoValue: 'font-mono text-sm tabular-nums text-text',
  geoRow: 'flex flex-wrap items-center justify-between gap-2',
  geoActions: 'flex flex-wrap items-center gap-2',
  geoMissing: 'text-xs text-text-subtle',
  /**
   * An anchor, styled like a secondary button. A `<Button>` inside an `<a>`
   * would nest interactive elements — invalid HTML, and a screen reader
   * announces it twice.
   */
  geoLink:
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-compact border ' +
    'border-line-strong bg-surface px-3 text-[13px] font-semibold text-text ' +
    'transition-colors duration-[var(--duration-fast)] hover:bg-surface-muted ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'focus-visible:outline-coral',
} as const
