export const styles = {
  meta: 'flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted',
  mono: 'font-mono text-label text-text-secondary',
  banner: 'flex items-start gap-3 rounded-card border px-4 py-3 text-body leading-relaxed',
  bannerWarn: 'border-amber/40 bg-amber-soft text-amber-ink',
  note: 'flex items-start gap-2 rounded-compact border border-line bg-surface-muted px-3 py-2 text-xs text-text-muted',
  scroller: 'overflow-x-auto',
  table: 'w-full border-collapse text-body',
  th: 'border-b border-line px-3 py-2 text-left text-caption font-semibold uppercase tracking-wide text-text-secondary',
  thNum:
    'border-b border-line px-3 py-2 text-right text-caption font-semibold uppercase tracking-wide text-text-secondary',
  td: 'border-b border-line/70 px-3 py-2 align-middle',
  tdNum: 'border-b border-line/70 px-3 py-2 text-right tabular-nums align-middle',
  name: 'font-semibold text-text-primary',
  chips: 'flex flex-wrap items-center gap-1',
  // 44×44 target (WCAG 2.2 AA) for the only control on the page.
  toggle:
    'inline-flex min-h-11 min-w-11 items-center rounded-compact px-2 text-caption font-semibold text-accent-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
  detailCell: 'border-b border-line/70 bg-surface-muted px-3 py-2',
  stack: 'flex flex-col gap-4',
  skeletonRow: 'h-4 w-full',
} as const
