export const styles = {
  rowFacts: 'rounded-compact border border-line bg-surface-muted p-3',
  factGrid: 'grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-[12px]',
  factKey: 'font-mono text-text-subtle',
  factValue: 'text-text',
  list: 'mt-4 flex flex-col gap-2',
  candidate: 'flex gap-3 rounded-card border border-line p-3',
  candidateActive: 'border-coral bg-coral-soft/40',
  thumb: 'h-14 w-14 shrink-0 rounded-compact object-cover',
  thumbFallback:
    'flex h-14 w-14 shrink-0 items-center justify-center rounded-compact bg-surface-sunken text-[11px] text-text-subtle',
  name: 'text-[13px] font-semibold text-text',
  address: 'text-[11px] text-text-subtle',
  meta: 'mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted',
  attribution: 'mt-3 text-[11px] text-text-subtle',
  reasons: 'mt-2 flex flex-wrap gap-1',
  reason: 'rounded-pill bg-surface-sunken px-2 py-0.5 font-mono text-[10px] text-text-muted',
} as const
