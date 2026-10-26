export const styles = {
  facts: 'grid gap-x-6 gap-y-2 sm:grid-cols-2',
  factRow: 'flex items-baseline justify-between gap-4 border-b border-line/70 py-1.5 text-body',
  factLabel: 'text-text-secondary',
  factValue: 'text-right font-semibold text-text-primary',
  mono: 'font-mono text-label text-text-muted',
  totals: 'grid gap-4 sm:grid-cols-2',
  head: 'flex flex-wrap items-center gap-2',
  scroller: 'overflow-x-auto',
  table: 'w-full border-collapse text-body',
  th: 'border-b border-line px-3 py-2 text-left text-caption font-semibold tracking-wide text-text-secondary uppercase',
  thNum:
    'border-b border-line px-3 py-2 text-right text-caption font-semibold tracking-wide text-text-secondary uppercase',
  td: 'border-b border-line/70 px-3 py-2 align-top',
  tdNum: 'border-b border-line/70 px-3 py-2 text-right align-top tabular-nums',
  service: 'font-semibold text-text-primary',
  muted: 'text-caption text-text-secondary',
  unknownCell: 'text-caption text-text-secondary italic',
  note: 'flex items-start gap-2 rounded-compact border border-line bg-surface-muted px-3 py-2 text-xs text-text-muted',
  noteWarn:
    'flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  idChip:
    'rounded-pill border border-line-strong bg-surface-canvas px-2 py-0.5 font-mono text-caption text-text-muted',
  idList: 'mt-1 flex flex-wrap gap-1',
} as const
