export const styles = {
  filterBar: 'flex flex-wrap items-end gap-3 border-b border-line px-4 py-3',
  search: 'w-64',
  name: 'text-body font-semibold text-text-primary',
  email: 'font-mono text-label text-text-muted',
  muted: 'text-label text-text-secondary',
  pager: 'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3',
  pagerInfo: 'text-xs text-text-secondary',
  pagerActions: 'flex items-center gap-2',
  privacyNote:
    'rounded-compact bg-surface-muted px-3 py-2 text-caption leading-relaxed text-text-secondary',
  actions: 'flex items-center justify-end gap-1',
  dialogBody: 'flex flex-col gap-4',
  dialogTarget: 'text-body font-semibold text-text-primary',
  dialogHint: 'text-xs text-text-muted',
  dialogError:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger-ink',
  tempWrap: 'flex flex-col gap-4',
  tempWarn:
    'flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  tempPassword:
    'select-all rounded-compact border border-line bg-surface-canvas px-4 py-3 text-center font-mono text-lg font-bold tracking-wide text-text-primary',
  tempActions: 'flex justify-end gap-2',
} as const
