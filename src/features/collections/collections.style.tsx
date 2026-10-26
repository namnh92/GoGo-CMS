export const styles = {
  layout: 'grid gap-5 xl:grid-cols-2',
  item: 'flex w-full items-center gap-3 rounded-compact border p-3 text-left',
  itemActive: 'border-accent-primary/40 bg-accent-soft/40',
  itemIdle: 'border-transparent hover:bg-surface-muted',
  cover: 'h-10 w-12 shrink-0 rounded-compact object-cover',
  coverFallback:
    'flex h-10 w-12 shrink-0 items-center justify-center rounded-compact bg-surface-canvas text-caption text-text-secondary',
  title: 'truncate text-body font-semibold text-text-primary',
  meta: 'truncate text-caption text-text-secondary',
  form: 'flex flex-col gap-4',
  itemRow: 'flex items-center gap-2 rounded-compact bg-surface-muted px-3 py-2',
  itemName: 'min-w-0 flex-1 truncate text-body font-medium text-text-primary',
  itemNote: 'shrink-0 text-caption text-text-secondary',
  orderButtons: 'flex flex-col',
  scheduleRow: 'grid gap-3 sm:grid-cols-2',
  contractNote:
    'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text-primary',
} as const
