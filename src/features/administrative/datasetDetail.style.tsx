export const styles = {
  stack: 'flex flex-col gap-4',
  headerActions: 'flex flex-wrap items-center gap-2',
  tableCard: 'overflow-hidden',

  facts: 'grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3',
  fact: 'min-w-0',
  factLabel: 'text-caption font-semibold uppercase tracking-wide text-text-secondary',
  factValue: 'mt-0.5 text-body text-text-primary',
  version: 'block break-all font-mono text-label text-text-primary',
  meta: 'text-label text-text-muted',

  banner:
    'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  bannerDanger:
    'flex items-start gap-2 rounded-compact border border-danger/45 bg-danger-soft px-3 py-2 text-xs text-text-primary',

  findingList: 'flex flex-col gap-2',
  finding: 'rounded-compact border border-line bg-surface-card px-3 py-2.5',
  findingHead: 'flex flex-wrap items-baseline justify-between gap-2',
  findingGate: 'font-mono text-label font-semibold text-text-primary',
  findingMessage: 'mt-1 text-body text-text-muted',
  samples: 'mt-1.5 flex flex-wrap gap-1',
  sample:
    'rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-caption text-text-muted',

  categoryList: 'flex flex-wrap gap-2',
  categoryChip:
    'inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-3 text-label font-semibold',
  categoryChipOn: 'border-coral bg-coral-soft text-coral-ink',
  categoryChipOff: 'border-line bg-surface-card text-text-muted hover:bg-surface-muted',
  categoryCount: 'tabular-nums',

  identity: 'font-mono text-label text-text-primary',
  identityMeta: 'block text-caption text-text-secondary',

  detailsBlock: 'rounded-compact border border-line bg-surface-muted px-3 py-2',
  detailsSummary: 'cursor-pointer text-label font-semibold text-text-muted',
  pre: 'mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-caption text-text-muted',
} as const
