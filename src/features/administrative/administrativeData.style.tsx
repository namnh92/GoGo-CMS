export const styles = {
  stack: 'flex flex-col gap-4',
  tableCard: 'overflow-hidden',

  capability: 'flex flex-col gap-4',
  capabilityGrid: 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4',
  capabilityCell: 'rounded-compact border border-line bg-surface-muted px-3 py-2.5',
  capabilityValue: 'mt-1',
  capabilityHint: 'mt-1 text-[11px] text-text-muted',

  facts: 'grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3',
  fact: 'min-w-0',
  factLabel: 'text-[11px] font-semibold uppercase tracking-wide text-text-subtle',
  factValue: 'mt-0.5 text-[13px] text-text',

  version: 'block break-all font-mono text-[12px] text-text',
  checksumRow: 'inline-flex items-center gap-1',
  checksum: 'font-mono text-[12px] text-text-muted',

  countRow: 'flex flex-col gap-1.5',
  countList: 'flex flex-wrap gap-2',
  countItem:
    'inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1 text-[12px] text-text-muted',
  countValue: 'tabular-nums text-text',

  blocked:
    'mt-2 flex items-start gap-1.5 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text',
  actions: 'flex flex-wrap items-center justify-end gap-2',
  toolbar: 'flex flex-wrap items-center justify-between gap-3',

  rowVersion: 'block max-w-[18rem] truncate font-mono text-[12px] font-semibold text-text',
  rowMeta: 'text-[12px] text-text-muted',
} as const
