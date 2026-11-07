export const styles = {
  section: 'flex flex-col gap-2 text-body text-text-primary',
  title: 'text-body font-bold uppercase tracking-wide text-text-muted',
  hint: 'text-label text-text-muted',
  grid: 'grid gap-3 sm:grid-cols-2',
  card: 'flex flex-col gap-2 rounded-compact border border-line bg-surface-canvas p-3',
  image: 'h-40 w-full object-contain',
  largeImage: 'max-h-[65vh] w-full object-contain',
  selection: 'flex min-h-11 cursor-pointer items-center gap-2 text-body',
} as const
