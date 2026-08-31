export const styles = {
  filterBar: 'flex flex-wrap items-end gap-3 border-b border-line px-4 py-3',
  dateField: 'w-40',
  author: 'text-[13px] font-semibold text-text',
  place: 'text-[12px] text-text-muted',
  preview: 'line-clamp-2 max-w-sm text-[13px] text-text-muted',
  muted: 'text-[12px] text-text-subtle',
  rating: 'flex items-center gap-1 text-[13px] tabular-nums text-text',
  pager: 'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3',
  pagerInfo: 'text-xs text-text-subtle',
  pagerActions: 'flex items-center gap-2',
  notFound:
    'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text',
  privacyNote:
    'rounded-compact bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-text-subtle',
} as const
