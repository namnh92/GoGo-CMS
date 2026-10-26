export const styles = {
  wrap: 'flex flex-col gap-2',
  label: 'text-xs font-semibold text-text-muted',
  dropzone:
    'flex items-center gap-3 rounded-compact border border-dashed border-line-strong bg-surface-canvas px-3 py-3',
  preview: 'h-16 w-28 shrink-0 rounded-compact object-cover',
  placeholder:
    'flex h-16 w-28 shrink-0 items-center justify-center rounded-compact bg-surface-muted text-caption text-text-secondary',
  body: 'min-w-0 flex-1',
  key: 'truncate font-mono text-caption text-text-secondary',
  hint: 'mt-0.5 text-caption text-text-secondary',
  error: 'flex items-start gap-1 text-xs font-medium text-danger',
  actions: 'flex shrink-0 items-center gap-2',
  hiddenInput: 'sr-only',
} as const
