export const styles = {
  kpiGrid: 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3',
  splitGrid: 'grid gap-4 xl:grid-cols-2',
  breakdown: 'flex flex-col gap-3',
  barTrack: 'flex h-3 w-full overflow-hidden rounded-pill bg-surface-sunken',
  legend: 'flex flex-wrap gap-4 text-[11px] text-text-muted',
  legendItem: 'flex items-center gap-1.5',
  legendSwatch: 'inline-block h-2.5 w-2.5 rounded-sm',
  legendValue: 'font-semibold tabular-nums text-text',
  backlogRow: 'flex items-baseline justify-between border-b border-line py-2 last:border-b-0',
  backlogLabel: 'text-[13px] text-text-muted',
  backlogValue: 'font-display text-lg font-extrabold tabular-nums text-text',
  note: 'flex items-start gap-2 rounded-compact border border-line bg-surface-muted px-3 py-2 text-xs text-text-muted',
  cta: 'mt-3 flex justify-end',

  queueRow:
    'flex w-full items-baseline justify-between gap-3 border-b border-line py-2 text-left last:border-b-0 hover:bg-surface-muted',
  queueLabel: 'text-[13px] text-text-muted',
  queueValue: 'font-display text-lg font-extrabold tabular-nums text-text',
  queueZero: 'font-display text-lg font-extrabold tabular-nums text-text-subtle',

  jobRow: 'flex items-center gap-3 border-b border-line py-2.5 last:border-b-0',
  jobName: 'truncate text-[13px] font-semibold text-text',
  jobMeta: 'text-[11px] text-text-subtle',
  jobTotals: 'ml-auto shrink-0 text-right text-[11px] tabular-nums text-text-muted',

  trendRow: 'flex items-center gap-3 border-b border-line py-2 last:border-b-0',
  trendDay: 'w-20 shrink-0 text-[12px] tabular-nums text-text-muted',
  trendBar: 'block h-2.5 w-full overflow-hidden rounded-pill bg-surface-sunken',
  trendFill: 'block h-full rounded-pill bg-coral',
  trendValue: 'w-32 shrink-0 text-right text-[12px] tabular-nums text-text',

  sectionTitle: 'mt-2 text-xs font-bold uppercase tracking-widest text-text-subtle',
  gapGrid: 'grid gap-4 xl:grid-cols-2',
  gapCard: 'flex flex-col gap-2',
  gapBadge:
    'inline-flex w-fit items-center gap-1.5 rounded-pill bg-surface-sunken px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-text-subtle',
  gapList: 'flex flex-col gap-1.5 text-xs text-text-muted',
  gapItem: 'flex items-start gap-2',
  gapMono: 'font-mono text-[11px] text-text-subtle',
} as const
