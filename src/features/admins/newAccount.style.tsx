export const styles = {
  panel: 'max-w-xl',
  form: 'flex flex-col gap-4',
  grid: 'grid gap-4 md:grid-cols-2',
  footer: 'flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4',
  alertDanger:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger-ink',
  requestId: 'mt-1 block font-mono text-[11px] text-text-subtle',
  note: 'flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text',
  roleHint: 'text-xs text-text-subtle',
  success: 'flex flex-col gap-3',
  successTitle: 'font-display text-base font-bold text-text',
  successBody: 'text-[13px] text-text-muted',
  successActions: 'flex flex-wrap gap-2',
} as const
