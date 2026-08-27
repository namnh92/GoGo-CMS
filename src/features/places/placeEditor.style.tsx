export const styles = {
  grid: 'grid gap-5 xl:grid-cols-3',
  main: 'flex flex-col gap-5 xl:col-span-2',
  side: 'flex flex-col gap-5',
  fieldRow: 'grid gap-4 sm:grid-cols-2',
  tagRow: 'flex flex-wrap gap-2',
  tag: 'inline-flex items-center gap-1 rounded-pill border border-lavender/35 bg-lavender-soft px-2.5 py-1 text-[11px] font-semibold text-lavender',
  tagRemove: 'ml-0.5 rounded-full p-0.5 hover:bg-lavender/15',
  tagAdd:
    'inline-flex min-h-11 items-center rounded-pill border border-dashed border-line-strong px-3 text-[11px] font-semibold text-text-subtle hover:border-neutral-500 hover:text-text',
  hoursRow:
    'grid grid-cols-[6rem_1fr_1fr_auto] items-center gap-2 border-b border-line py-2 last:border-b-0',
  dayLabel: 'text-[13px] font-medium text-text-muted',
  timeInput:
    'min-h-11 w-full rounded-compact border border-line-strong bg-surface px-2 text-[13px] text-text tabular-nums',
  priceRow:
    'flex items-center justify-between gap-2 border-b border-line py-2 text-[13px] last:border-b-0',
  priceValue: 'font-semibold tabular-nums text-text',
  priceMeta: 'text-[11px] text-text-subtle',
  mediaRow: 'flex flex-wrap gap-2',
  mediaThumb: 'h-16 w-16 rounded-compact object-cover',
  mediaAdd:
    'flex h-16 w-16 items-center justify-center rounded-compact border-2 border-dashed border-line-strong text-text-subtle hover:border-neutral-500',
  mapFrame: 'relative mb-3 h-36 overflow-hidden rounded-compact bg-surface-sunken',
  mapPin:
    'absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-neutral-0 bg-coral',
  mapNote: 'absolute bottom-1 left-2 text-[10px] text-text-subtle',
  saveBar:
    'sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-5 py-3',
  saveState: 'flex items-center gap-2 text-xs text-text-muted',
  dot: 'h-2 w-2 rounded-full',
  duplicateCard: 'rounded-card border border-amber/45 bg-surface',
  duplicateBody:
    'flex flex-wrap items-center justify-between gap-3 rounded-compact bg-surface-muted p-3',
  duplicateName: 'text-[13px] font-semibold text-text',
  duplicateMeta: 'text-[11px] text-text-subtle',
  sourceRow:
    'flex items-start justify-between gap-2 border-b border-line py-2 text-[12px] last:border-b-0',
  attribution: 'mt-2 text-[11px] text-text-subtle',
} as const
