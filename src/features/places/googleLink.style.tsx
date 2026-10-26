export const styles = {
  wrap: 'flex flex-col gap-3',
  reading: 'flex flex-wrap items-center gap-2',
  code: 'break-all font-mono text-caption text-text-muted',
  note: 'text-caption text-text-secondary',
  comparison: 'flex flex-col gap-2 rounded-compact border border-line bg-surface-canvas p-2.5',
  diff: 'grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5',
  diffKey: 'text-caption font-semibold uppercase tracking-wide text-text-muted',
  diffValue: 'break-all font-mono text-caption text-text-primary',
  blocked: 'flex flex-col gap-1 rounded-compact border border-dashed border-line-strong p-2.5',
  blockedWhy: 'text-caption text-text-secondary',
  blockedLink: 'text-caption font-semibold text-accent-primary underline underline-offset-2',
} as const
