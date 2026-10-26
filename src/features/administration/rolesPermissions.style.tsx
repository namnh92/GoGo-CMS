export const styles = {
  roleGrid: 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4',
  roleCard: 'flex flex-col gap-2 px-5 py-4',
  roleName: 'font-display text-title font-bold text-text-primary',
  roleScope: 'text-xs leading-relaxed text-text-muted',
  roleMeta: 'mt-auto flex items-center gap-3 pt-2 text-caption text-text-secondary',
  roleCount: 'font-semibold tabular-nums text-text-primary',

  matrixWrap: 'overflow-x-auto',
  matrix: 'w-full min-w-[640px] border-collapse text-sm',
  headRow: 'border-b border-line',
  headCell:
    'px-3 py-2.5 text-left text-caption font-semibold uppercase tracking-wide text-text-secondary',
  headRole: 'w-28 text-center',
  groupRow: 'border-b border-line bg-surface-muted',
  groupCell: 'px-3 py-2 text-caption font-bold uppercase tracking-widest text-text-secondary',
  row: 'border-b border-line last:border-b-0 hover:bg-surface-muted',
  permCell: 'px-3 py-2.5',
  permKey: 'font-mono text-label text-text-primary',
  permAccess: 'ml-2 align-middle',
  cell: 'px-3 py-2.5 text-center',
  yes: 'inline-flex items-center gap-1 text-mint',
  no: 'text-text-secondary/50',
  srOnly: 'sr-only',

  note: 'flex items-start gap-2 rounded-compact border border-line bg-surface-muted px-3 py-2 text-xs text-text-muted',
} as const
