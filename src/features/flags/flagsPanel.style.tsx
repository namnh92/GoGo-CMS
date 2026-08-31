export const styles = {
  scopeBar: 'flex flex-wrap items-end gap-3 border-b border-line px-5 py-3',
  scopeNote: 'ml-auto max-w-sm text-[11px] leading-relaxed text-text-subtle',
  row: 'flex flex-col gap-3 border-b border-line px-5 py-4 last:border-b-0',
  head: 'flex flex-wrap items-start justify-between gap-3',
  key: 'font-mono text-[13px] font-semibold text-text',
  desc: 'mt-0.5 max-w-xl text-xs text-text-muted',
  badges: 'mt-1.5 flex flex-wrap items-center gap-1.5',
  meta: 'mt-1 text-[11px] text-text-subtle',
  editor: 'flex flex-wrap items-end gap-2',
  valueField: 'w-72',
  jsonField: 'w-full max-w-xl',
  actions: 'flex shrink-0 items-center gap-2',
  fallback: 'font-mono text-[11px] text-text-subtle',
  orphan:
    'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text',
  secretsNote:
    'rounded-compact bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-text-subtle',
} as const
