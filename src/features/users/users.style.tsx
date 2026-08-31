export const styles = {
  filterBar: 'flex flex-wrap items-end gap-3 border-b border-line px-4 py-3',
  search: 'w-64',
  name: 'text-[13px] font-semibold text-text',
  email: 'font-mono text-[12px] text-text-muted',
  deletedEmail: 'text-[12px] italic text-text-subtle',
  muted: 'text-[12px] text-text-subtle',
  count: 'tabular-nums text-[13px] text-text',
  countSub: 'text-[10px] text-text-subtle',
  pager: 'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3',
  pagerInfo: 'text-xs text-text-subtle',
  pagerActions: 'flex items-center gap-2',
  mono: 'font-mono text-[12px] text-text-muted',
  privacyNote:
    'rounded-compact bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-text-subtle',

  drawerSection: 'border-b border-line px-5 py-4 last:border-b-0',
  drawerName: 'font-display text-base font-bold text-text',
  drawerMetaGrid: 'mt-3 grid grid-cols-2 gap-2 text-xs text-text-muted',
  drawerLabel: 'text-[11px] uppercase tracking-wide text-text-subtle',
  statGrid: 'grid grid-cols-2 gap-3',
  statCard: 'rounded-card bg-surface-muted px-3 py-2.5',
  statValue: 'font-display text-xl font-extrabold tabular-nums text-text',
  statLabel: 'text-[11px] text-text-subtle',
  roomRow: 'flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0',
  roomMain: 'min-w-0',
  roomTitle: 'truncate text-[13px] font-medium text-text',
  roomMeta: 'text-[11px] text-text-subtle',
  reasonBox:
    'flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text',
  actionCol: 'flex flex-col gap-2',
  dangerBox:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-text',

  dialogBody: 'flex flex-col gap-4',
  dialogTarget: 'text-[13px] font-semibold text-text',
  dialogHint: 'text-xs text-text-muted',
  dialogError:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger',
} as const
