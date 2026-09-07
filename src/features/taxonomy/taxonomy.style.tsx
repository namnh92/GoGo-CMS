export const styles = {
  layout: 'grid gap-5 xl:grid-cols-4',
  nav: 'h-fit rounded-card border border-line bg-surface p-3',
  navTitle: 'mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-text-subtle',
  navItem:
    'flex w-full min-h-11 items-center justify-between gap-2 rounded-compact px-3 text-[13px] font-semibold',
  navActive: 'bg-coral-soft text-coral-ink',
  navIdle: 'text-text-muted hover:bg-surface-sunken hover:text-text',
  navCount: 'text-[11px] tabular-nums',
  content: 'flex flex-col gap-5 xl:col-span-3',
  key: 'font-mono text-[12px] text-text-muted',
  label: 'text-[13px] font-semibold text-text',
  usage: 'text-[13px] font-semibold tabular-nums text-text',
  synonymRow: 'flex flex-wrap items-center gap-2 rounded-compact bg-surface-muted p-3',
  synonymTerm: 'rounded-pill bg-surface px-2 py-0.5 font-mono text-[11px] text-text-muted',
  arrow: 'text-text-subtle',
  addRow: 'grid gap-3 md:grid-cols-4',
  blocked:
    'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text',
} as const
