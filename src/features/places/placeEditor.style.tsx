export const styles = {
  grid: 'grid gap-5 xl:grid-cols-3',
  main: 'flex flex-col gap-5 xl:col-span-2',
  side: 'flex flex-col gap-5',
  fieldRow: 'grid gap-4 sm:grid-cols-2',
  tagRow: 'flex flex-wrap gap-2',
  tag: 'inline-flex items-center gap-1 rounded-pill border border-lavender/35 bg-lavender-soft px-2.5 py-1 text-caption font-semibold text-lavender-ink',
  tagRemove: 'ml-0.5 rounded-full p-0.5 hover:bg-lavender/15',
  tagAdd:
    'inline-flex min-h-11 items-center rounded-pill border border-dashed border-line-strong px-3 text-caption font-semibold text-text-secondary hover:border-neutral-500 hover:text-text-primary',
  hoursRow:
    'grid grid-cols-[6rem_1fr_1fr_auto] items-center gap-2 border-b border-line py-2 last:border-b-0',
  hourMeta: 'col-span-4 -mt-1 text-caption text-text-secondary',
  dayLabel: 'text-body font-medium text-text-muted',
  timeInput:
    'min-h-11 w-full rounded-compact border border-line-strong bg-surface-card px-2 text-body text-text-primary tabular-nums',
  priceRow:
    'flex items-center justify-between gap-2 border-b border-line py-2 text-body last:border-b-0',
  priceValue: 'font-semibold tabular-nums text-text-primary',
  priceMeta: 'text-caption text-text-secondary',
  saveBar:
    'sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-card px-5 py-3',
  saveState: 'flex items-center gap-1.5 text-xs text-text-muted',
  dot: 'h-2 w-2 rounded-full',
  errorPanel: 'rounded-compact border border-danger/40 bg-danger-soft/50 px-3 py-2.5',
  conflictPanel: 'rounded-compact border border-amber/50 bg-amber-soft/50 px-3 py-2.5',
  conflictTitle: 'flex items-center gap-1 text-body font-semibold text-text-primary',
  conflictMine: 'font-semibold text-text-primary',
  conflictTheirs: 'text-text-muted',
  provenanceGrid: 'mt-1.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4',
  provenanceRow: 'rounded-compact border border-line bg-surface-muted px-2.5 py-1.5',
  provenanceValue: 'block text-label font-medium text-text-primary',
  provenanceMeta: 'block text-caption font-normal text-text-secondary',
  // "No recorded origin" is a fact, not an error — stated, never coloured red.
  provenanceEmpty: 'text-label italic text-text-secondary',
  errorTitle: 'flex items-center gap-1 text-body font-semibold text-danger',
  errorText: 'mt-1 text-xs text-text-muted',
  errorList: 'mt-1.5 flex flex-col gap-1 text-xs text-text-muted',
  errorField: 'font-mono text-caption font-semibold text-danger',
  requestId:
    'select-all rounded bg-surface-canvas px-1 py-0.5 font-mono text-caption text-text-primary',
  duplicateCard: 'rounded-card border border-amber/45 bg-surface-card',
  duplicateBody:
    'flex flex-wrap items-center justify-between gap-3 rounded-compact bg-surface-muted p-3',
  duplicateName: 'text-body font-semibold text-text-primary',
  duplicateMeta: 'text-caption text-text-secondary',
  sourceRow:
    'flex items-start justify-between gap-2 border-b border-line py-2 text-label last:border-b-0',
  sourceLink: 'block truncate text-caption text-lavender underline underline-offset-2',
  attribution: 'mt-2 text-caption text-text-secondary',
  factGrid: 'grid grid-cols-2 gap-3 sm:grid-cols-4',
  factLabel: 'block text-caption text-text-secondary',
  factValue: 'block truncate text-body text-text-primary',
  factLink: 'text-lavender underline underline-offset-2',
  ratingRow: 'grid gap-3 sm:grid-cols-2',
  ratingCard: 'rounded-compact border border-line bg-surface-muted px-3 py-2',
  ratingValue: 'block text-heading font-semibold tabular-nums text-text-primary',
} as const
