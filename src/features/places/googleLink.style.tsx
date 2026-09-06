export const styles = {
  wrap: 'flex flex-col gap-3',
  reading: 'flex flex-wrap items-center gap-2',
  code: 'break-all font-mono text-[11px] text-text-muted',
  note: 'text-[11px] text-text-subtle',
  comparison: 'flex flex-col gap-2 rounded-compact border border-line bg-surface-sunken p-2.5',
  diff: 'grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5',
  diffKey: 'text-[11px] font-semibold uppercase tracking-wide text-text-muted',
  diffValue: 'break-all font-mono text-[11px] text-text',
  blocked: 'flex flex-col gap-1 rounded-compact border border-dashed border-line-strong p-2.5',
  blockedWhy: 'text-[11px] text-text-subtle',
  blockedLink: 'text-[11px] font-semibold text-coral underline underline-offset-2',
} as const
