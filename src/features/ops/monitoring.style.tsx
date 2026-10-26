export const styles = {
  toolbar: 'flex flex-wrap items-center justify-between gap-3',
  windowGroup: 'inline-flex rounded-pill border border-line bg-surface-card p-0.5',
  windowButton:
    'rounded-pill px-3 py-1 text-xs font-semibold text-text-muted transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
  windowButtonActive: 'bg-coral-soft text-coral-ink',
  kpiGrid: 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4',
  banner: 'flex items-start gap-3 rounded-card border px-4 py-3 text-body leading-relaxed',
  bannerWarn: 'border-amber/40 bg-amber-soft text-amber-ink',
  bannerDown: 'border-danger/40 bg-danger-soft text-danger-ink',
  bannerInfo: 'border-line bg-surface-muted text-text-muted',
  note: 'flex items-start gap-2 rounded-compact border border-line bg-surface-muted px-3 py-2 text-xs text-text-muted',
  table: 'w-full border-collapse text-body',
  th: 'border-b border-line px-3 py-2 text-left text-caption font-semibold uppercase tracking-wide text-text-secondary',
  thNum:
    'border-b border-line px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-secondary',
  td: 'border-b border-line/70 px-3 py-2 align-middle',
  tdNum: 'border-b border-line/70 px-3 py-2 text-right tabular-nums align-middle',
  provider: 'font-semibold text-text-primary',
  method: 'font-mono text-label text-text-muted',
  unmeasured: 'text-label italic text-text-secondary',
  // The small line under a badge (registry table: 'số liệu tới …').
  gapDetail: 'text-caption leading-relaxed text-text-muted',
  trendGrid: 'grid gap-4 sm:grid-cols-2',
  trendCard: 'rounded-card border border-line bg-surface-card p-4',
  trendLabel: 'text-xs font-semibold text-text-secondary',
  trendValue: 'mt-0.5 font-display text-xl font-extrabold tabular-nums text-text-primary',
  scroller: 'overflow-x-auto',
  toggle:
    'mt-1 text-caption font-semibold text-accent-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
  detailCell: 'border-b border-line/70 bg-surface-muted px-3 py-2',
  detailCaption: 'mb-1 text-caption font-semibold text-text-secondary',
} as const
