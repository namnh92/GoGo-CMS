export const styles = {
  transition:
    'flex flex-wrap items-center gap-2 rounded-compact border border-line bg-surface-muted px-3 py-2',
  transitionLabel: 'text-[11px] font-semibold uppercase tracking-wide text-text-subtle',
  from: 'rounded bg-danger-soft px-1.5 py-0.5 text-[13px] text-danger line-through',
  arrow: 'text-text-subtle',
  to: 'rounded bg-amber-soft px-1.5 py-0.5 text-[13px] font-semibold text-text',
  resource: 'mt-2 text-[13px] font-semibold text-text',
  resourceId: 'font-mono text-[11px] text-text-subtle',
  warning:
    'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text',
  note: 'text-[11px] leading-relaxed text-text-subtle',
  counter: 'text-right text-[11px] tabular-nums text-text-subtle',
} as const
