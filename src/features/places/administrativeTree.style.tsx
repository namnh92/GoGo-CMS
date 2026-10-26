export const styles = {
  panel: 'rounded-card border border-line bg-surface-card',
  head: 'flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3',
  title: 'text-body font-semibold text-text-primary',
  dataset: 'font-mono text-caption text-text-secondary',
  body: 'flex flex-col',
  // A row is a control: full width, left-aligned, and tall enough to hit.
  row:
    'flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left ' +
    'transition-colors duration-[var(--duration-fast)] hover:bg-surface-muted ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
  // Selection is never colour alone (design-system): the row also carries a
  // check glyph and `aria-pressed`.
  rowSelected: 'bg-surface-muted font-semibold',
  communeRow: 'pl-10',
  chevron: 'shrink-0 text-text-secondary transition-transform duration-[var(--duration-fast)]',
  name: 'min-w-0 flex-1 truncate text-body text-text-primary',
  count: 'shrink-0 tabular-nums text-label font-semibold text-text-primary',
  review: 'shrink-0 tabular-nums text-caption text-amber-ink',
  check: 'shrink-0 text-accent-primary',
  reviewRow: 'border-t border-line',
  reviewBreakdown: 'flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-caption text-text-secondary',
  footer: 'border-t border-line px-4 py-2 text-caption text-text-secondary',
  clear: 'px-4 py-2',
} as const
