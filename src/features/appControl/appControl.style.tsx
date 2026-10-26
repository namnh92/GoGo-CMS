export const styles = {
  scopeBar: 'flex flex-wrap items-end gap-3 border-b border-line px-5 py-3',
  scopeNote: 'ml-auto max-w-sm text-caption leading-relaxed text-text-secondary',

  sectionBody: 'flex flex-col gap-4 px-5 py-4',

  maintRow: 'flex flex-wrap items-center gap-4',
  maintState: 'flex items-center gap-2',
  maintOn: 'font-display text-lg font-extrabold text-danger',
  maintOff: 'font-display text-lg font-extrabold text-mint',
  maintScope: 'text-xs text-text-muted',
  maintWarn:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-text-primary',

  versionRow: 'flex flex-wrap items-end gap-3 border-b border-line py-3 last:border-b-0',
  versionKey: 'w-56 shrink-0',
  versionLabel: 'text-body font-semibold text-text-primary',
  versionDesc: 'text-caption text-text-secondary',
  versionField: 'w-36',
  versionMeta: 'text-caption text-text-secondary',

  switchRow: 'flex items-start gap-4 border-b border-line py-3 last:border-b-0',
  switchBody: 'min-w-0 flex-1',
  switchKey: 'font-mono text-body font-semibold text-text-primary',
  switchDesc: 'mt-0.5 text-xs text-text-muted',
  switchMeta: 'mt-1 text-caption text-text-secondary',

  badges: 'flex flex-wrap items-center gap-1.5',
  missing:
    'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  note: 'flex items-start gap-2 rounded-compact border border-line bg-surface-muted px-3 py-2 text-xs text-text-muted',
} as const
