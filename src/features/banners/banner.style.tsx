export const styles = {
  filterBar: 'flex flex-wrap items-end gap-3 border-b border-line px-4 py-3',
  search: 'w-64',
  name: 'text-body font-semibold text-text-primary',
  sub: 'text-caption text-text-secondary',
  muted: 'text-label text-text-secondary',
  priority: 'tabular-nums text-body text-text-primary',
  thumb: 'h-10 w-16 rounded-compact object-cover',
  thumbEmpty:
    'flex h-10 w-16 items-center justify-center rounded-compact bg-surface-muted text-caption text-text-secondary',
  pager: 'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3',
  pagerInfo: 'text-xs text-text-secondary',
  pagerActions: 'flex items-center gap-2',

  layout: 'grid gap-5 xl:grid-cols-5',
  main: 'xl:col-span-3',
  side: 'xl:col-span-2 flex flex-col gap-5',
  formGrid: 'grid gap-4 md:grid-cols-2',
  formFull: 'md:col-span-2',
  actions: 'flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4',
  statusRow: 'flex flex-wrap items-center gap-2 px-5 py-4',
  facts: 'grid gap-3 px-5 py-4 sm:grid-cols-2',
  factLabel: 'text-caption uppercase tracking-wide text-text-secondary',
  factValue: 'text-body text-text-primary',
  note: 'mx-5 mb-4 flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  formNote:
    'flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  hint: 'rounded-compact bg-surface-muted px-3 py-2 text-caption text-text-secondary',
  previewCard: 'px-5 py-4',
  previewFrame: 'overflow-hidden rounded-standard border border-line bg-surface-canvas',
  previewImage: 'h-40 w-full object-cover',
  previewEmpty:
    'flex h-40 w-full items-center justify-center bg-surface-muted text-xs text-text-secondary',
  previewBody: 'px-4 py-3',
  previewTitle: 'font-display text-sm font-bold text-text-primary',
  previewSubtitle: 'mt-0.5 text-xs text-text-muted',
  previewCta:
    'mt-2 inline-flex rounded-pill bg-accent-primary px-3 py-1 text-caption font-semibold text-neutral-0',
} as const
