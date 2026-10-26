export const styles = {
  sourceLegend: 'grid gap-3 sm:grid-cols-3',
  sourceTerm: 'text-caption font-semibold uppercase tracking-wide text-text-secondary',
  sourceList: 'mt-1 text-label leading-relaxed text-text-primary',
  sourceNote: 'mt-3 text-caption text-text-secondary',
  summaryGrid: 'grid gap-4 sm:grid-cols-2 xl:grid-cols-5',
  validationGrid: 'grid gap-4 p-5 pt-0 sm:grid-cols-2 xl:grid-cols-4',
  validationFoot: 'border-t border-line px-5 py-3 text-caption text-text-secondary',
  quota:
    'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  headerActions: 'flex flex-wrap items-center gap-2',
  filterRow: 'flex flex-wrap items-center gap-2',
  rowNumber: 'font-mono text-label text-text-secondary',
  placeName: 'max-w-[18rem] truncate text-body font-semibold text-text-primary',
  placeMeta: 'max-w-[18rem] truncate text-caption text-text-secondary',
  reasons: 'flex max-w-[12rem] flex-wrap gap-1',
  reason: 'rounded-pill bg-surface-canvas px-2 py-0.5 font-mono text-caption text-text-muted',
  messages: 'flex max-w-[14rem] flex-col gap-0.5',
  errorCode: 'font-mono text-caption font-semibold uppercase tracking-wide',
  errorMsg: 'text-caption font-medium text-danger',
  warnMsg: 'text-caption text-amber',
  actions: 'flex items-center justify-end gap-1',
  unmapped: 'flex flex-wrap gap-1',
  unmappedChip: 'rounded-pill bg-amber-soft px-2 py-0.5 font-mono text-caption text-text-primary',
  // A missing required column blocked rows; an unmapped header only dropped a
  // cell. Same shape, different weight, so the two are not read as one thing.
  missingChip:
    'rounded-pill bg-danger-soft px-2 py-0.5 font-mono text-caption font-semibold text-text-primary',
} as const
