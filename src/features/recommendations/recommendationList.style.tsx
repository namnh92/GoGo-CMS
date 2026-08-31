export const styles = {
  filterBar: 'flex flex-wrap items-end gap-3 border-b border-line px-4 py-3',
  search: 'w-64',
  name: 'text-[13px] font-semibold text-text',
  slug: 'font-mono text-[11px] text-text-subtle',
  muted: 'text-[12px] text-text-subtle',
  priority: 'tabular-nums text-[13px] text-text',
  pager: 'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3',
  pagerInfo: 'text-xs text-text-subtle',
  pagerActions: 'flex items-center gap-2',
  formGrid: 'grid gap-4 md:grid-cols-2',
  formFull: 'md:col-span-2',
  note: 'flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text',
} as const
