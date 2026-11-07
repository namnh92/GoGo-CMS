export const styles = {
  section: 'flex flex-col gap-3 text-body text-text-primary',
  title: 'text-body font-bold uppercase tracking-wide text-text-muted',
  facts: 'flex flex-col gap-3',
  row: 'flex flex-col gap-1',
  label: 'text-label font-medium text-text-secondary',
  chips: 'flex flex-wrap gap-2',
  chip: 'rounded-pill border border-line bg-surface-muted px-3 py-2 text-label',
  note: 'whitespace-pre-wrap rounded-compact bg-surface-muted p-3 text-body',
  selection: 'flex min-h-11 cursor-pointer items-center gap-2 text-label',
  warning: 'rounded-compact border border-amber/45 bg-amber-soft p-3 text-body text-text-primary',
} as const
