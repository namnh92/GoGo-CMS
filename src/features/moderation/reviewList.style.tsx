export const styles = {
  filterBar: 'flex flex-wrap items-end gap-3 border-b border-line px-4 py-3',
  dateField: 'w-40',
  author: 'text-body font-semibold text-text-primary',
  place: 'text-label text-text-muted',
  preview: 'line-clamp-2 max-w-sm text-body text-text-muted',
  muted: 'text-label text-text-secondary',
  rating: 'flex items-center gap-1 text-body tabular-nums text-text-primary',
  pager: 'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3',
  pagerInfo: 'text-xs text-text-secondary',
  pagerActions: 'flex items-center gap-2',
  notFound:
    'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  privacyNote:
    'rounded-compact bg-surface-muted px-3 py-2 text-caption leading-relaxed text-text-secondary',
} as const
