export const styles = {
  root: 'flex min-h-full items-center justify-center bg-surface-sunken p-6',
  panel: 'w-full max-w-md rounded-sheet border border-line bg-surface p-8',
  brand: 'mb-6 flex items-center gap-2',
  brandName: 'font-display text-lg font-extrabold text-text',
  brandTag: 'rounded bg-coral-soft px-1.5 py-0.5 text-[10px] font-bold text-coral-deep',
  title: 'font-display text-xl font-bold text-text',
  subtitle: 'mt-1 text-xs text-text-muted',
  form: 'mt-6 flex flex-col gap-4',
  alert:
    'flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text',
  alertDanger:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger',
  footNote: 'mt-6 border-t border-line pt-4 text-[11px] leading-relaxed text-text-subtle',
  localeRow: 'mt-4 flex items-center justify-center gap-1 text-[11px] text-text-subtle',
  localeButton: 'min-h-11 rounded-compact px-2 font-semibold hover:text-text',
  localeActive: 'text-coral-deep',
} as const
