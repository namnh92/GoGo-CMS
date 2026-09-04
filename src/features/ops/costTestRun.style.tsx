export const styles = {
  facts: 'grid gap-x-6 gap-y-2 sm:grid-cols-2',
  factRow: 'flex items-baseline justify-between gap-4 border-b border-line/70 py-1.5 text-[13px]',
  factLabel: 'text-text-subtle',
  factValue: 'text-right font-semibold text-text',
  mono: 'font-mono text-[12px] text-text-muted',
  totals: 'grid gap-4 sm:grid-cols-2',
  head: 'flex flex-wrap items-center gap-2',
  scroller: 'overflow-x-auto',
  table: 'w-full border-collapse text-[13px]',
  th: 'border-b border-line px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-text-subtle uppercase',
  thNum:
    'border-b border-line px-3 py-2 text-right text-[11px] font-semibold tracking-wide text-text-subtle uppercase',
  td: 'border-b border-line/70 px-3 py-2 align-top',
  tdNum: 'border-b border-line/70 px-3 py-2 text-right align-top tabular-nums',
  service: 'font-semibold text-text',
  muted: 'text-[11px] text-text-subtle',
  unknownCell: 'text-[11px] text-text-subtle italic',
  note: 'flex items-start gap-2 rounded-compact border border-line bg-surface-muted px-3 py-2 text-xs text-text-muted',
  noteWarn:
    'flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text',
  idChip:
    'rounded-pill border border-line-strong bg-surface-sunken px-2 py-0.5 font-mono text-[10px] text-text-muted',
  idList: 'mt-1 flex flex-wrap gap-1',
} as const
