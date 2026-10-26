export const styles = {
  filterBar: 'flex flex-wrap items-end gap-3 border-b border-line px-4 py-3',
  search: 'w-64',
  name: 'text-body font-semibold text-text-primary',
  email: 'font-mono text-label text-text-muted',
  deletedEmail: 'text-label italic text-text-secondary',
  muted: 'text-label text-text-secondary',
  count: 'tabular-nums text-body text-text-primary',
  countSub: 'text-caption text-text-secondary',
  pager: 'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3',
  pagerInfo: 'text-xs text-text-secondary',
  pagerActions: 'flex items-center gap-2',
  mono: 'font-mono text-label text-text-muted',
  privacyNote:
    'rounded-compact bg-surface-muted px-3 py-2 text-caption leading-relaxed text-text-secondary',

  drawerSection: 'border-b border-line px-5 py-4 last:border-b-0',
  drawerName: 'font-display text-base font-bold text-text-primary',
  drawerMetaGrid: 'mt-3 grid grid-cols-2 gap-2 text-xs text-text-muted',
  drawerLabel: 'text-caption uppercase tracking-wide text-text-secondary',
  statGrid: 'grid grid-cols-2 gap-3',
  statCard: 'rounded-card bg-surface-muted px-3 py-2.5',
  statValue: 'font-display text-xl font-extrabold tabular-nums text-text-primary',
  statLabel: 'text-caption text-text-secondary',
  roomRow: 'flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0',
  roomMain: 'min-w-0',
  roomTitle: 'truncate text-body font-medium text-text-primary',
  roomMeta: 'text-caption text-text-secondary',
  reasonBox:
    'flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  actionCol: 'flex flex-col gap-2',
  dangerBox:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-text-primary',

  dialogBody: 'flex flex-col gap-4',
  dialogTarget: 'text-body font-semibold text-text-primary',
  dialogHint: 'text-xs text-text-muted',
  dialogError:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger-ink',
} as const
