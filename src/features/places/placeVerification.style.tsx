export const styles = {
  screen: 'flex max-w-3xl flex-col gap-4',
  panel: 'flex flex-col gap-4 rounded-card border border-line bg-surface-card p-5',
  row: 'flex flex-wrap items-center gap-3',
  title: 'text-title font-semibold text-text-primary',
  text: 'text-body text-text-muted',
  notice: 'rounded-compact border border-line bg-surface-canvas p-3 text-body text-text-muted',
  facts: 'grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body text-text-primary',
} as const
