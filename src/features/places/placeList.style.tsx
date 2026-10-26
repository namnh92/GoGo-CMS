export const styles = {
  toolbar: 'flex flex-wrap items-center gap-2',
  search: 'w-full max-w-xs',
  filterInput:
    'min-h-11 w-40 rounded-compact border border-line-strong bg-surface-card px-3 text-body text-text-primary placeholder:text-text-secondary',
  // The area picker needs room for a label and a popup; the bare filter boxes
  // beside it do not.
  filterCombobox: 'w-52',
  // The hierarchy sits beside the table on a wide screen and above it on a
  // narrow one — it is a filter, and a filter belongs where the thing it
  // filters can be seen.
  hierarchyLayout: 'grid items-start gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]',
  tableCard: 'overflow-hidden min-w-0',
  cover: 'h-10 w-10 shrink-0 rounded-compact object-cover',
  coverFallback:
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-compact bg-surface-canvas text-caption font-bold text-text-secondary',
  name: 'max-w-[16rem] truncate text-body font-semibold text-text-primary',
  address: 'max-w-[16rem] truncate text-caption text-text-secondary',
  tagRow: 'flex max-w-[12rem] flex-wrap gap-1',
  tag: 'rounded-pill bg-surface-canvas px-2 py-0.5 text-caption font-medium text-text-muted',
  ratingStack: 'flex flex-col gap-0.5',
  ratingRow: 'flex items-center gap-1 text-caption tabular-nums text-text-muted',
  ratingLabel: 'w-10 text-text-secondary',
  ratingValue: 'font-semibold text-text-primary',
  muted: 'text-label text-text-muted',
  adminCell: 'flex min-w-[8.5rem] flex-col leading-tight',
  adminCommune: 'text-label text-text-primary',
  adminProvince: 'text-caption text-text-secondary',
  mono: 'font-mono text-caption text-text-secondary',
  actions: 'flex items-center justify-end gap-0.5',
  duplicateGrid: 'grid gap-3 lg:grid-cols-2',
  duplicateCard: 'rounded-compact border border-line bg-surface-muted p-3',
  duplicateHead: 'mb-2 flex items-center justify-between gap-2',
  duplicateName: 'text-body font-semibold text-text-primary',
  duplicateMeta: 'text-caption text-text-secondary',
  duplicateFooter: 'mt-3 flex flex-wrap items-center justify-between gap-2',
  movesRow: 'flex flex-wrap gap-2 text-caption text-text-muted',
} as const
