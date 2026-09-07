export const styles = {
  stack: 'flex flex-col gap-4',
  section: 'flex flex-col gap-3',
  tableCard: 'overflow-hidden',

  toolbar: 'flex flex-wrap items-end justify-between gap-3',
  filters: 'flex flex-wrap items-end gap-3',
  actions: 'flex flex-wrap items-center justify-end gap-2',

  facts: 'grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3',
  fact: 'min-w-0',
  factLabel: 'text-[11px] font-semibold uppercase tracking-wide text-text-subtle',
  factValue: 'mt-0.5 text-[13px] text-text',
  meta: 'text-[12px] text-text-muted',
  mono: 'font-mono text-[12px] text-text',
  address: 'text-[13px] text-text',

  blockRow: 'inline-flex flex-wrap items-center gap-2',
  countList: 'flex flex-wrap gap-2',
  countItem:
    'inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1 text-[12px] text-text-muted',
  countValue: 'tabular-nums font-semibold text-text',

  notice:
    'flex items-start gap-2 rounded-compact border border-lavender/45 bg-lavender-soft px-3 py-2 text-xs text-text',
  warn: 'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text',
  danger:
    'flex items-start gap-2 rounded-compact border border-danger/45 bg-danger-soft px-3 py-2 text-xs text-text',

  selectors: 'grid gap-3 sm:grid-cols-2',

  evidenceList: 'flex flex-col gap-2',
  evidence: 'rounded-compact border border-line bg-surface px-3 py-2.5',
  evidenceHead: 'flex flex-wrap items-baseline justify-between gap-2',
  evidenceMethod: 'font-mono text-[12px] font-semibold text-text',
  evidenceDetail: 'mt-1 text-[13px] text-text-muted',

  rowName: 'block max-w-[16rem] truncate text-[13px] font-semibold text-text',
  rowMeta: 'block text-[12px] text-text-muted',
} as const
