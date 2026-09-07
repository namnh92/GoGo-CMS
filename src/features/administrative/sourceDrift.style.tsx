export const styles = {
  stack: 'flex flex-col gap-4',
  section: 'flex flex-col gap-3',

  countGroups: 'grid gap-3 lg:grid-cols-3',
  countCard: 'rounded-card border border-line bg-surface-muted px-4 py-3',
  countTitle: 'text-[11px] font-semibold uppercase tracking-wide text-text-subtle',
  countHint: 'mt-0.5 text-[11px] text-text-muted',
  countList: 'mt-2 flex flex-wrap gap-2',
  countItem:
    'inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1 text-[12px] text-text-muted',
  countValue: 'tabular-nums font-semibold text-text',

  notice:
    'flex items-start gap-2 rounded-compact border border-lavender/45 bg-lavender-soft px-3 py-2 text-xs text-text',
  warn: 'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text',
  danger:
    'flex items-start gap-2 rounded-compact border border-danger/45 bg-danger-soft px-3 py-2 text-xs text-text',

  toolbar: 'flex flex-wrap items-end justify-between gap-3',
  filters: 'flex flex-wrap items-end gap-3',
  actions: 'flex flex-wrap items-center justify-end gap-2',

  facts: 'grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3',
  fact: 'min-w-0',
  factLabel: 'text-[11px] font-semibold uppercase tracking-wide text-text-subtle',
  factValue: 'mt-0.5 text-[13px] text-text',
  meta: 'text-[12px] text-text-muted',
  mono: 'font-mono text-[12px] text-text',

  identity: 'font-mono text-[12px] text-text',
  identityName: 'block text-[12px] text-text-muted',
  identityMeta: 'block text-[11px] text-text-subtle',

  candidateList: 'flex flex-col gap-2',
  candidate:
    'flex items-start gap-3 rounded-compact border border-line bg-surface px-3 py-2.5 text-left',
  candidateOn: 'border-coral bg-coral-soft/40',
  candidateOff: 'opacity-60',
  candidateBody: 'min-w-0 flex-1',
  candidateWhy: 'mt-1 text-[11px] text-text-subtle',

  history: 'flex flex-col gap-2',
  historyItem: 'rounded-compact border border-line bg-surface px-3 py-2.5',
  historySuperseded:
    'rounded-compact border border-dashed border-line bg-surface-muted px-3 py-2.5',
  historyHead: 'flex flex-wrap items-baseline justify-between gap-2',
  historyReason: 'mt-1 text-[13px] text-text-muted',

  detailsBlock: 'rounded-compact border border-line bg-surface-muted px-3 py-2',
  detailsSummary: 'cursor-pointer text-[12px] font-semibold text-text-muted',
  pre: 'mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-text-muted',

  samples: 'mt-1 flex flex-wrap gap-1',
  sample:
    'rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-text-muted',
} as const
