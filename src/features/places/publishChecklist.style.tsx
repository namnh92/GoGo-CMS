export const styles = {
  wrap: 'flex flex-col gap-4',
  groupTitle: 'text-xs font-semibold uppercase tracking-wide text-text-muted',
  groupHint: 'mt-0.5 mb-2 text-xs text-text-secondary',
  list: 'divide-y divide-line rounded-compact border border-line',
  row: 'flex items-center gap-2 px-2.5 py-2',
  markMet: 'w-4 shrink-0 text-center text-sm font-bold text-mint',
  markUnmet: 'w-4 shrink-0 text-center text-sm text-text-secondary',
  label: 'min-w-0 flex-1 truncate text-body text-text-primary',
  freshness: 'mt-2 text-caption text-text-secondary',
  blocked: 'flex items-start gap-1 text-xs font-medium text-danger',

  geoGrid: 'mb-3 flex flex-col gap-2 rounded-compact border border-line bg-surface-canvas p-3',
  geoLabel: 'text-caption font-semibold uppercase tracking-wide text-text-muted',
  geoValue: 'font-mono text-sm tabular-nums text-text-primary',
  geoRow: 'flex flex-wrap items-center justify-between gap-2',
  geoActions: 'flex flex-wrap items-center gap-2',
  geoMissing: 'text-xs text-text-secondary',
  /**
   * An anchor, styled like a secondary button. A `<Button>` inside an `<a>`
   * would nest interactive elements — invalid HTML, and a screen reader
   * announces it twice.
   */
  geoLink:
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-compact border ' +
    'border-line-strong bg-surface-card px-3 text-body font-semibold text-text-primary ' +
    'transition-colors duration-[var(--duration-fast)] hover:bg-surface-muted ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'focus-visible:outline-focus',
} as const
