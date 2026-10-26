export const styles = {
  layout: 'grid gap-5 xl:grid-cols-5',
  main: 'xl:col-span-3',
  side: 'xl:col-span-2 flex flex-col gap-5',
  intro:
    'flex items-start gap-2 border-b border-line bg-surface-muted px-4 py-3 text-xs text-text-muted',
  name: 'text-body font-semibold text-text-primary',
  sub: 'text-caption text-text-secondary',
  muted: 'text-label text-text-secondary',
  money: 'tabular-nums text-body font-semibold text-text-primary',
  per: 'ml-1 text-caption font-normal text-text-secondary',
  formGrid: 'grid gap-4 md:grid-cols-2',
  formFull: 'md:col-span-2',
  formNote:
    'flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  footer: 'flex flex-wrap items-center justify-between gap-2',
  footerRight: 'flex items-center gap-2',
  auditBody: 'px-4 py-3',
} as const
