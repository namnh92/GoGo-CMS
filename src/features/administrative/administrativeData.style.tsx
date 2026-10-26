export const styles = {
  stack: 'flex flex-col gap-4',
  tableCard: 'overflow-hidden',

  capability: 'flex flex-col gap-4',
  capabilityGrid: 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4',
  capabilityCell: 'rounded-compact border border-line bg-surface-muted px-3 py-2.5',
  capabilityValue: 'mt-1',
  capabilityHint: 'mt-1 text-caption text-text-muted',

  facts: 'grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3',
  fact: 'min-w-0',
  factLabel: 'text-caption font-semibold uppercase tracking-wide text-text-secondary',
  factValue: 'mt-0.5 text-body text-text-primary',

  version: 'block break-all font-mono text-label text-text-primary',
  checksumRow: 'inline-flex items-center gap-1',
  checksum: 'font-mono text-label text-text-muted',

  countRow: 'flex flex-col gap-1.5',
  countList: 'flex flex-wrap gap-2',
  countItem:
    'inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface-card px-2.5 py-1 text-label text-text-muted',
  countValue: 'tabular-nums text-text-primary',

  blocked:
    'mt-2 flex items-start gap-1.5 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  actions: 'flex flex-wrap items-center justify-end gap-2',
  toolbar: 'flex flex-wrap items-center justify-between gap-3',

  rowVersion: 'block max-w-[18rem] truncate font-mono text-label font-semibold text-text-primary',
  rowMeta: 'text-label text-text-muted',
} as const
