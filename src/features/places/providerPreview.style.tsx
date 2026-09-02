export const styles = {
  tierRow: 'flex flex-wrap items-start gap-2',
  tierButton:
    'flex min-h-11 flex-1 flex-col items-start rounded-compact border px-3 py-2 text-left transition-colors',
  tierIdle: 'border-line bg-surface hover:border-line-strong',
  tierSelected: 'border-lavender bg-lavender-soft',
  tierLabel: 'flex items-center gap-1.5 text-[13px] font-semibold text-text',
  tierHint: 'text-[11px] text-text-subtle',
  cost: 'mt-2 text-[11px] text-text-subtle',
  actions: 'mt-3 flex items-center gap-2',
  idle: 'mt-4 text-[12px] text-text-subtle',
  notice:
    'mt-4 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-[12px] text-text',
  table: 'mt-4 w-full border-collapse text-[12px]',
  th: 'border-b border-line py-1.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-text-subtle',
  td: 'border-b border-line py-1.5 pr-3 align-top text-text',
  tdLabel: 'whitespace-nowrap font-medium text-text-muted',
  tdEmpty: 'italic text-text-subtle',
  differs: 'ml-1.5 align-middle',
  meta: 'mt-3 text-[11px] text-text-subtle',
  ephemeral:
    'mt-3 rounded-compact border border-lavender/35 bg-lavender-soft px-3 py-2 text-[12px] text-text',
} as const
