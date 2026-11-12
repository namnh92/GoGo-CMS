export const styles = {
  fieldset: 'flex min-w-0 flex-col gap-3',
  legend: 'text-label font-semibold text-text-muted',
  hint: 'text-caption text-text-secondary',
  chips: 'flex flex-wrap gap-1',
  chip: 'inline-flex max-w-full items-center gap-1 rounded-pill border border-lavender/35 bg-lavender-soft px-2.5 text-caption font-semibold text-lavender-ink',
  chipText: 'truncate whitespace-nowrap',
  row: 'flex items-start gap-2',
  input: 'min-w-0 flex-1',
  evidence: 'grid gap-3 rounded-compact border border-amber/50 bg-amber-soft/30 p-3 sm:grid-cols-2',
} as const
