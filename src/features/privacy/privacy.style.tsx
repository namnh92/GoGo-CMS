export const styles = {
  filterBar: 'flex flex-wrap items-end gap-3 border-b border-line px-4 py-3',
  subject: 'text-body font-semibold text-text-primary',
  subjectMeta: 'font-mono text-caption text-text-secondary',
  muted: 'text-label text-text-secondary',
  due: 'text-label tabular-nums text-text-primary',
  dueOver: 'text-label font-semibold tabular-nums text-danger',
  pager: 'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3',
  pagerInfo: 'text-xs text-text-secondary',
  pagerActions: 'flex items-center gap-2',
  privacyNote:
    'rounded-compact bg-surface-muted px-3 py-2 text-caption leading-relaxed text-text-secondary',

  section: 'border-b border-line px-5 py-4 last:border-b-0',
  label: 'text-caption uppercase tracking-wide text-text-secondary',
  value: 'text-body text-text-primary',
  grid: 'mt-2 grid grid-cols-2 gap-3',
  badges: 'mt-2 flex flex-wrap items-center gap-1.5',
  holdBox:
    'flex flex-col gap-1 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  overdueBox:
    'flex items-start gap-2 rounded-compact border border-danger/45 bg-danger-soft px-3 py-2 text-xs text-text-primary',
  actionCol: 'mt-2 flex flex-col gap-2',
  dialogBody: 'flex flex-col gap-4',
  dialogTarget: 'text-body font-semibold text-text-primary',
  dialogHint: 'text-xs text-text-muted',
  dialogError:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger-ink',
  noteGuidance: 'text-caption leading-relaxed text-text-secondary',
  formGrid: 'grid gap-4',
} as const
