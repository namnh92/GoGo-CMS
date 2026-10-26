export const styles = {
  layout: 'grid gap-5 xl:grid-cols-4',
  nav: 'h-fit rounded-card border border-line bg-surface-card p-3',
  navTitle: 'mb-2 px-2 text-caption font-bold uppercase tracking-widest text-text-secondary',
  navItem:
    'flex w-full min-h-11 items-center justify-between gap-2 rounded-compact px-3 text-body font-semibold',
  navActive: 'bg-coral-soft text-coral-ink',
  navIdle: 'text-text-muted hover:bg-surface-canvas hover:text-text-primary',
  navCount: 'text-caption tabular-nums',
  content: 'flex flex-col gap-5 xl:col-span-3',
  key: 'font-mono text-label text-text-muted',
  label: 'text-body font-semibold text-text-primary',
  usage: 'text-body font-semibold tabular-nums text-text-primary',
  synonymRow: 'flex flex-wrap items-center gap-2 rounded-compact bg-surface-muted p-3',
  synonymTerm: 'rounded-pill bg-surface-card px-2 py-0.5 font-mono text-caption text-text-muted',
  arrow: 'text-text-secondary',
  addRow: 'grid gap-3 md:grid-cols-4',
  blocked:
    'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text-primary',
} as const
