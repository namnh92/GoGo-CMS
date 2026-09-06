export const styles = {
  wrap: 'flex flex-col gap-4',

  quickApply: 'rounded-compact border border-line bg-surface-sunken p-3 flex flex-col gap-3',
  quickTitle: 'text-xs font-semibold text-text-muted',
  presetRow: 'flex flex-wrap gap-1.5',
  dayToggleRow: 'flex flex-wrap gap-1.5',
  dayToggle:
    'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-compact ' +
    'border px-2.5 text-xs font-semibold transition-colors ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ' +
    'disabled:cursor-not-allowed disabled:opacity-60',
  dayToggleOn: 'border-coral bg-coral/10 text-coral',
  dayToggleOff: 'border-line-strong bg-surface text-text-muted hover:border-neutral-500',
  applyRow: 'flex flex-wrap items-end gap-2',
  applyHint: 'text-xs text-text-subtle',

  dayList: 'flex flex-col gap-3',
  day: 'rounded-compact border border-line p-3 flex flex-col gap-2.5',
  dayHeader: 'flex flex-wrap items-center justify-between gap-2',
  dayName: 'text-sm font-semibold text-text',
  stateRow: 'flex flex-wrap gap-1.5',
  stateChip:
    'inline-flex min-h-[44px] items-center gap-1.5 rounded-compact border px-2.5 text-xs font-semibold ' +
    'transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'focus-visible:outline-coral disabled:cursor-not-allowed disabled:opacity-60',
  stateChipOn: 'border-coral bg-coral/10 text-coral',
  stateChipOff: 'border-line-strong bg-surface text-text-muted hover:border-neutral-500',

  intervals: 'flex flex-col gap-2',
  intervalRow: 'flex flex-wrap items-center gap-2',
  timeInput:
    'w-[5.5rem] rounded-compact border border-line-strong bg-surface px-2 py-2 text-sm tabular-nums text-text ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-coral ' +
    'aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-surface-sunken',
  dash: 'text-xs text-text-subtle',
  rowError: 'flex items-start gap-1 text-xs font-medium text-danger',
  meta: 'text-[11px] text-text-subtle',
  emptyDay: 'text-xs text-text-subtle',

  preview: 'flex flex-col gap-1 text-xs',
  previewDay: 'flex items-center gap-2',
} as const
