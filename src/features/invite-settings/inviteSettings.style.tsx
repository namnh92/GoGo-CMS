export const styles = {
  layout: 'flex max-w-3xl flex-col gap-5',
  form: 'flex flex-col gap-4',
  fields: 'grid gap-4 sm:grid-cols-2',
  metadata: 'grid gap-2 text-xs text-text-secondary',
  value: 'font-semibold text-text-primary',
  notice: 'rounded-compact border border-amber/45 bg-amber-soft p-3 text-body text-text-primary',
  hint: 'text-xs text-text-secondary',
  actions: 'flex justify-end',
  skeleton: 'h-11 w-full',
  skeletonValue: 'h-5 w-48',
} as const
