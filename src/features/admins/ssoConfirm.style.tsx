export const styles = {
  body: 'flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between',
  text: 'flex flex-col gap-1',
  title: 'text-body font-semibold text-text-primary',
  hint: 'text-xs text-text-muted',
  ok: 'flex items-start gap-2 rounded-compact border border-mint/40 bg-mint-soft px-3 py-2 text-xs text-text-primary',
  error:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger-ink',
} as const
