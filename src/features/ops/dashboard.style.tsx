export const styles = {
  kpiGrid: 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3',
  splitGrid: 'grid gap-4 xl:grid-cols-2',
  breakdown: 'flex flex-col gap-3',
  barTrack: 'flex h-3 w-full overflow-hidden rounded-pill bg-surface-canvas',
  legend: 'flex flex-wrap gap-4 text-caption text-text-muted',
  legendItem: 'flex items-center gap-1.5',
  legendSwatch: 'inline-block h-2.5 w-2.5 rounded-sm',
  legendValue: 'font-semibold tabular-nums text-text-primary',
  backlogRow: 'flex items-baseline justify-between border-b border-line py-2 last:border-b-0',
  backlogLabel: 'text-body text-text-muted',
  backlogValue: 'font-display text-lg font-extrabold tabular-nums text-text-primary',
  note: 'flex items-start gap-2 rounded-compact border border-line bg-surface-muted px-3 py-2 text-xs text-text-muted',
  cta: 'mt-3 flex justify-end',

  queueRow:
    'flex w-full items-baseline justify-between gap-3 border-b border-line py-2 text-left last:border-b-0 hover:bg-surface-muted',
  queueLabel: 'text-body text-text-muted',
  queueValue: 'font-display text-lg font-extrabold tabular-nums text-text-primary',
  queueZero: 'font-display text-lg font-extrabold tabular-nums text-text-secondary',

  jobRow: 'flex items-center gap-3 border-b border-line py-2.5 last:border-b-0',
  jobName: 'truncate text-body font-semibold text-text-primary',
  jobMeta: 'text-caption text-text-secondary',
  jobTotals: 'ml-auto shrink-0 text-right text-caption tabular-nums text-text-muted',

  trendRow: 'flex items-center gap-3 border-b border-line py-2 last:border-b-0',
  trendDay: 'w-20 shrink-0 text-label tabular-nums text-text-muted',
  trendBar: 'block h-2.5 w-full overflow-hidden rounded-pill bg-surface-canvas',
  trendFill: 'block h-full rounded-pill bg-coral',
  trendValue: 'w-32 shrink-0 text-right text-label tabular-nums text-text-primary',

  sectionTitle: 'mt-2 text-xs font-bold uppercase tracking-widest text-text-secondary',

  healthRow: 'flex items-center gap-3 border-b border-line py-2 last:border-b-0',
  healthKey: 'w-36 shrink-0 font-mono text-label font-semibold text-text-primary',
  healthStatus: 'flex w-28 shrink-0 items-center gap-1.5 text-label font-semibold',
  healthHealthy: 'text-mint',
  healthDegraded: 'text-amber',
  healthDown: 'text-danger',
  healthUnknown: 'text-text-secondary',
  healthDot: 'inline-block h-2 w-2 rounded-full bg-current',
  healthLatency: 'w-16 shrink-0 text-right text-label tabular-nums text-text-muted',
  healthDetail: 'min-w-0 flex-1 truncate text-caption text-text-secondary',

  queueTableWrap: 'overflow-x-auto',
  queueTable: 'w-full min-w-[520px] text-sm',
  queueHead:
    'border-b border-line text-left text-caption font-semibold uppercase tracking-wide text-text-secondary',
  queueHeadCell: 'px-2 py-2',
  queueCellName: 'px-2 py-2 font-mono text-label text-text-primary',
  queueCell: 'px-2 py-2 text-right tabular-nums text-body text-text-primary',
  queueCellMuted: 'px-2 py-2 text-right tabular-nums text-body text-text-secondary',
  queueCellBad: 'px-2 py-2 text-right tabular-nums text-body font-semibold text-danger',
  queueRowLine: 'border-b border-line last:border-b-0',

  costRow: 'flex items-center gap-3 border-b border-line py-2.5 last:border-b-0',
  costKey: 'w-36 shrink-0 text-body font-medium text-text-primary',
  costBasis: 'shrink-0',
  costQuota: 'min-w-0 flex-1',
  costValue: 'w-40 shrink-0 text-right text-label tabular-nums text-text-muted',
  costEmpty:
    'flex items-start gap-2 rounded-compact border border-line bg-surface-muted px-3 py-2 text-xs text-text-muted',
} as const
