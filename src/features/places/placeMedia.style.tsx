export const styles = {
  /* Uploader ------------------------------------------------------------ */
  dropzone:
    'flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-surface-canvas px-4 py-6 text-center transition-colors duration-[var(--duration-fast)]',
  dropzoneActive: 'border-accent-primary bg-accent-soft/40',
  dropzoneDisabled: 'opacity-60',
  dropzoneTitle: 'text-body font-semibold text-text-primary',
  dropzoneHint: 'max-w-md text-caption text-text-secondary',
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
  queueName: 'truncate text-body font-semibold text-text-primary',
  queueMeta: 'mt-0.5 flex flex-wrap items-center gap-2 text-caption text-text-secondary',
  queueError: 'mt-1 flex items-start gap-1 text-caption font-medium text-danger',
  queueActions: 'flex shrink-0 items-center gap-1',
  queueThumb: 'h-12 w-16 shrink-0 rounded-compact object-cover',
  queueThumbFallback:
    'flex h-12 w-16 shrink-0 items-center justify-center rounded-compact bg-surface-canvas text-center text-caption leading-tight text-text-secondary',

  /* Media list ---------------------------------------------------------- */
  list: 'flex flex-col gap-2',
  item: 'flex flex-col gap-2 rounded-card border border-line bg-surface-card p-3 sm:flex-row sm:items-start sm:gap-3',
  itemCover: 'border-coral/45 bg-coral-soft/25',
  thumb: 'h-20 w-28 shrink-0 rounded-compact object-cover',
  thumbFallback:
    'flex h-20 w-28 shrink-0 items-center justify-center rounded-compact border border-dashed border-line-strong bg-surface-canvas px-2 text-center text-caption leading-tight text-text-secondary',
  itemBody: 'min-w-0 flex-1',
  badgeRow: 'flex flex-wrap items-center gap-1.5',
  caption: 'mt-1.5 text-body text-text-primary',
  captionEmpty: 'mt-1.5 text-body italic text-text-secondary',
  attribution: 'mt-0.5 text-caption text-text-secondary',
  key: 'mt-1 block truncate font-mono text-caption text-text-secondary',
  reason: 'mt-1.5 rounded-compact bg-surface-canvas px-2 py-1.5 text-caption text-text-muted',
  reasonLabel: 'font-semibold text-text-muted',
  /** GoGo-BE#441 — who last decided, and when. */
  provenance: 'mt-1 text-caption text-text-muted',
  provenanceModal: '-mt-1 mb-3 text-xs text-text-muted',
  adminId: 'font-mono',
  /** 44×44 target, dotted underline so it reads as a control, not as plain text. */
  adminIdToggle:
    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-compact px-1 font-mono text-text-primary underline decoration-dotted underline-offset-2 hover:bg-surface-canvas',
  adminIdFull: 'ml-1 break-all font-mono text-text-primary',
  whoWhen: 'mt-1 text-caption text-text-secondary',
  actions: 'mt-2 flex flex-wrap items-center gap-1.5',
  orderGroup: 'flex shrink-0 items-center',

  /* Shared -------------------------------------------------------------- */
  note: 'mt-3 flex items-start gap-1.5 rounded-compact bg-surface-canvas px-2.5 py-2 text-caption text-text-muted',
  noteWarn:
    'mt-3 flex items-start gap-1.5 rounded-compact bg-amber-soft px-2.5 py-2 text-caption text-text-muted',

  /* Attachable picker --------------------------------------------------- */
  pickList: 'flex flex-col gap-2',
  pickItem:
    'flex w-full items-center gap-3 rounded-compact border border-line bg-surface-card p-2.5 text-left hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60',
  pickThumb: 'h-12 w-16 shrink-0 rounded-compact object-cover',
  pickThumbFallback:
    'flex h-12 w-16 shrink-0 items-center justify-center rounded-compact bg-surface-canvas text-caption text-text-secondary',
  pickBody: 'min-w-0 flex-1',
  pickKey: 'truncate font-mono text-caption text-text-primary',
  pickMeta: 'mt-0.5 text-caption text-text-secondary',
} as const
