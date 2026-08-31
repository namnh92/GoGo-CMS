export const styles = {
  stack: 'flex flex-col gap-4',
  facts: 'grid grid-cols-2 gap-3 text-[12px]',
  factLabel: 'text-text-subtle',
  factValue: 'font-medium text-text',
  quote: 'rounded-compact bg-surface-muted p-3 text-[13px] italic text-text-muted',
  head: 'mb-1 text-[11px] font-bold uppercase tracking-wide text-text-subtle',
  decisionGrid: 'grid grid-cols-2 gap-2',
  reported:
    'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text',
  footer: 'flex flex-wrap items-center justify-between gap-2',
  privacyNote:
    'rounded-compact bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-text-subtle',
} as const
