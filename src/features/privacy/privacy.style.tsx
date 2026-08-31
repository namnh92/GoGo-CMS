export const styles = {
  filterBar: 'flex flex-wrap items-end gap-3 border-b border-line px-4 py-3',
  subject: 'text-[13px] font-semibold text-text',
  subjectMeta: 'font-mono text-[11px] text-text-subtle',
  muted: 'text-[12px] text-text-subtle',
  due: 'text-[12px] tabular-nums text-text',
  dueOver: 'text-[12px] font-semibold tabular-nums text-danger',
  pager: 'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3',
  pagerInfo: 'text-xs text-text-subtle',
  pagerActions: 'flex items-center gap-2',
  privacyNote:
    'rounded-compact bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-text-subtle',

  section: 'border-b border-line px-5 py-4 last:border-b-0',
  label: 'text-[11px] uppercase tracking-wide text-text-subtle',
  value: 'text-[13px] text-text',
  grid: 'mt-2 grid grid-cols-2 gap-3',
  badges: 'mt-2 flex flex-wrap items-center gap-1.5',
  holdBox:
    'flex flex-col gap-1 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text',
  overdueBox:
    'flex items-start gap-2 rounded-compact border border-danger/45 bg-danger-soft px-3 py-2 text-xs text-text',
  actionCol: 'mt-2 flex flex-col gap-2',
  dialogBody: 'flex flex-col gap-4',
  dialogTarget: 'text-[13px] font-semibold text-text',
  dialogHint: 'text-xs text-text-muted',
  dialogError:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger',
  noteGuidance: 'text-[11px] leading-relaxed text-text-subtle',
  formGrid: 'grid gap-4',
} as const
