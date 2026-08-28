export const styles = {
  toolbar: 'mb-5 flex flex-wrap items-end justify-between gap-3',
  kpiGrid: 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4',
  kpiCard: 'rounded-card border border-line bg-surface p-4',
  kpiLabel: 'block text-[12px] text-text-muted',
  kpiValue: 'mt-1 block font-display text-2xl font-extrabold tabular-nums text-text',
  kpiWindow: 'mt-1 block text-[11px] text-text-subtle',
  trendRow: 'flex items-center gap-3 border-b border-line py-2 last:border-b-0',
  trendDay: 'w-24 shrink-0 text-[12px] tabular-nums text-text-muted',
  trendBar: 'block h-2.5 w-full overflow-hidden rounded-pill bg-surface-sunken',
  trendFill: 'block h-full rounded-pill bg-coral',
  trendValue: 'w-32 shrink-0 text-right text-[12px] tabular-nums text-text',
  queryRow:
    'flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-b-0',
  queryText: 'min-w-0 flex-1 truncate text-[13px] text-text',
  queryMeta: 'text-[12px] tabular-nums text-text-muted',
  note: 'flex items-start gap-2 rounded-compact border border-line bg-surface-muted px-3 py-2 text-xs text-text-muted',
  hidden: 'rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text',
} as const
