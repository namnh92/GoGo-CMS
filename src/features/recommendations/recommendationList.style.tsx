export const styles = {
  filterBar: 'flex flex-wrap items-end gap-3 border-b border-line px-4 py-3',
  search: 'w-64',
  name: 'text-body font-semibold text-text-primary',
  slug: 'font-mono text-caption text-text-secondary',
  muted: 'text-label text-text-secondary',
  priority: 'tabular-nums text-body text-text-primary',
  pager: 'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3',
  pagerInfo: 'text-xs text-text-secondary',
  pagerActions: 'flex items-center gap-2',
  formGrid: 'grid gap-4 md:grid-cols-2',
  formFull: 'md:col-span-2',
  note: 'flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text-primary',
} as const
