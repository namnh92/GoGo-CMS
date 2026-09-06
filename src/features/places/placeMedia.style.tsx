export const styles = {
  /* Uploader ------------------------------------------------------------ */
  dropzone:
    'flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-surface-sunken px-4 py-6 text-center transition-colors duration-[var(--duration-fast)]',
  dropzoneActive: 'border-coral bg-coral-soft/40',
  dropzoneDisabled: 'opacity-60',
  dropzoneTitle: 'text-[13px] font-semibold text-text',
  dropzoneHint: 'max-w-md text-[11px] text-text-subtle',
  dropzoneActions: 'mt-1 flex flex-wrap items-center justify-center gap-2',
  hiddenInput: 'sr-only',

  /* Upload queue -------------------------------------------------------- */
  queue: 'mt-4 flex flex-col gap-2',
  queueHead: 'flex items-center justify-between gap-2',
  queueTitle: 'text-xs font-semibold text-text-muted',
  queueItem: 'flex items-start gap-3 rounded-compact border border-line bg-surface-muted p-2.5',
  queueItemFailed: 'border-danger/40 bg-danger-soft/40',
  queueItemDone: 'border-mint/40 bg-mint-soft/40',
  queueBody: 'min-w-0 flex-1',
  queueName: 'truncate text-[13px] font-semibold text-text',
  queueMeta: 'mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-text-subtle',
  queueError: 'mt-1 flex items-start gap-1 text-[11px] font-medium text-danger',
  queueActions: 'flex shrink-0 items-center gap-1',
  queueThumb: 'h-12 w-16 shrink-0 rounded-compact object-cover',
  queueThumbFallback:
    'flex h-12 w-16 shrink-0 items-center justify-center rounded-compact bg-surface-sunken text-center text-[10px] leading-tight text-text-subtle',

  /* Media list ---------------------------------------------------------- */
  list: 'flex flex-col gap-2',
  item: 'flex flex-col gap-2 rounded-card border border-line bg-surface p-3 sm:flex-row sm:items-start sm:gap-3',
  itemCover: 'border-coral/45 bg-coral-soft/25',
  thumb: 'h-20 w-28 shrink-0 rounded-compact object-cover',
  thumbFallback:
    'flex h-20 w-28 shrink-0 items-center justify-center rounded-compact border border-dashed border-line-strong bg-surface-sunken px-2 text-center text-[10px] leading-tight text-text-subtle',
  itemBody: 'min-w-0 flex-1',
  badgeRow: 'flex flex-wrap items-center gap-1.5',
  caption: 'mt-1.5 text-[13px] text-text',
  captionEmpty: 'mt-1.5 text-[13px] italic text-text-subtle',
  attribution: 'mt-0.5 text-[11px] text-text-subtle',
  key: 'mt-1 block truncate font-mono text-[10px] text-text-subtle',
  reason: 'mt-1.5 rounded-compact bg-surface-sunken px-2 py-1.5 text-[11px] text-text-muted',
  reasonLabel: 'font-semibold text-text-muted',
  actions: 'mt-2 flex flex-wrap items-center gap-1.5',
  orderGroup: 'flex shrink-0 items-center',

  /* Shared -------------------------------------------------------------- */
  note: 'mt-3 flex items-start gap-1.5 rounded-compact bg-surface-sunken px-2.5 py-2 text-[11px] text-text-muted',
  noteWarn:
    'mt-3 flex items-start gap-1.5 rounded-compact bg-amber-soft px-2.5 py-2 text-[11px] text-text-muted',

  /* Attachable picker --------------------------------------------------- */
  pickList: 'flex flex-col gap-2',
  pickItem:
    'flex w-full items-center gap-3 rounded-compact border border-line bg-surface p-2.5 text-left hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60',
  pickThumb: 'h-12 w-16 shrink-0 rounded-compact object-cover',
  pickThumbFallback:
    'flex h-12 w-16 shrink-0 items-center justify-center rounded-compact bg-surface-sunken text-[10px] text-text-subtle',
  pickBody: 'min-w-0 flex-1',
  pickKey: 'truncate font-mono text-[11px] text-text',
  pickMeta: 'mt-0.5 text-[11px] text-text-subtle',
} as const
