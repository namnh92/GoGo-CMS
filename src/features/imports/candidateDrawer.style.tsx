export const styles = {
  rowFacts: 'rounded-compact border border-line bg-surface-muted p-3',
  factGrid: 'grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-label',
  factKey: 'font-mono text-text-secondary',
  factValue: 'text-text-primary',
  list: 'mt-4 flex flex-col gap-2',
  candidate: 'flex gap-3 rounded-card border border-line p-3',
  candidateActive: 'border-accent-primary bg-accent-soft/40',
  thumb: 'h-14 w-14 shrink-0 rounded-compact object-cover',
  thumbFallback:
    'flex h-14 w-14 shrink-0 items-center justify-center rounded-compact bg-surface-canvas text-caption text-text-secondary',
  name: 'text-body font-semibold text-text-primary',
  address: 'text-caption text-text-secondary',
  meta: 'mt-1 flex flex-wrap items-center gap-2 text-caption text-text-muted',
  attribution: 'mt-3 text-caption text-text-secondary',
  reasons: 'mt-2 flex flex-wrap gap-1',
  reason: 'rounded-pill bg-surface-canvas px-2 py-0.5 font-mono text-caption text-text-muted',
} as const
