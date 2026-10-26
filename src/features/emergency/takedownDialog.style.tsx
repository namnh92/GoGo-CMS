export const styles = {
  transition:
    'flex flex-wrap items-center gap-2 rounded-compact border border-line bg-surface-muted px-3 py-2',
  transitionLabel: 'text-caption font-semibold uppercase tracking-wide text-text-secondary',
  from: 'rounded bg-danger-soft px-1.5 py-0.5 text-body text-danger-ink line-through',
  arrow: 'text-text-secondary',
  to: 'rounded bg-amber-soft px-1.5 py-0.5 text-body font-semibold text-text-primary',
  resource: 'mt-2 text-body font-semibold text-text-primary',
  resourceId: 'font-mono text-caption text-text-secondary',
  warning:
    'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  note: 'text-caption leading-relaxed text-text-secondary',
  offline:
    'flex w-full items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  counter: 'text-right text-caption tabular-nums text-text-secondary',
} as const
