export const styles = {
  toolbar: 'flex flex-wrap items-center gap-2',
  search: 'w-full max-w-xs',
  filterInput:
    'min-h-11 w-40 rounded-compact border border-line-strong bg-surface px-3 text-[13px] text-text placeholder:text-text-subtle',
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
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-compact bg-surface-sunken text-[10px] font-bold text-text-subtle',
  name: 'max-w-[16rem] truncate text-[13px] font-semibold text-text',
  address: 'max-w-[16rem] truncate text-[11px] text-text-subtle',
  tagRow: 'flex max-w-[12rem] flex-wrap gap-1',
  tag: 'rounded-pill bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-text-muted',
  ratingStack: 'flex flex-col gap-0.5',
  ratingRow: 'flex items-center gap-1 text-[11px] tabular-nums text-text-muted',
  ratingLabel: 'w-10 text-text-subtle',
  ratingValue: 'font-semibold text-text',
  muted: 'text-[12px] text-text-muted',
  adminCell: 'flex min-w-[8.5rem] flex-col leading-tight',
  adminCommune: 'text-[12px] text-text',
  adminProvince: 'text-[11px] text-text-subtle',
  mono: 'font-mono text-[11px] text-text-subtle',
  actions: 'flex items-center justify-end gap-0.5',
  duplicateGrid: 'grid gap-3 lg:grid-cols-2',
  duplicateCard: 'rounded-compact border border-line bg-surface-muted p-3',
  duplicateHead: 'mb-2 flex items-center justify-between gap-2',
  duplicateName: 'text-[13px] font-semibold text-text',
  duplicateMeta: 'text-[11px] text-text-subtle',
  duplicateFooter: 'mt-3 flex flex-wrap items-center justify-between gap-2',
  movesRow: 'flex flex-wrap gap-2 text-[11px] text-text-muted',
} as const
