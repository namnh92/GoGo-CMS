export const styles = {
  // Lists
  filterBar: 'flex flex-wrap items-end gap-3 border-b border-line px-4 py-3',
  search: 'w-64',
  name: 'text-body font-semibold text-text-primary',
  sub: 'font-mono text-caption text-text-secondary',
  muted: 'text-label text-text-secondary',
  num: 'tabular-nums text-body text-text-primary',
  pager: 'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3',
  pagerInfo: 'text-label text-text-secondary',
  pagerActions: 'flex items-center gap-2',
  searchHint: 'text-caption text-text-secondary',

  // Detail layout
  layout: 'grid gap-5 xl:grid-cols-3',
  main: 'xl:col-span-2 flex flex-col gap-5',
  side: 'flex flex-col gap-5',
  formGrid: 'grid gap-4 md:grid-cols-2',
  formFull: 'md:col-span-2',
  actions: 'flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4',
  facts: 'grid gap-3 px-5 py-4',
  factLabel: 'text-caption uppercase tracking-wide text-text-secondary',
  factValue: 'text-body text-text-primary',
  factSub: 'text-caption text-text-secondary',
  headerMeta: 'flex flex-wrap items-center gap-2 px-5 py-3 text-label text-text-secondary',
  note: 'flex items-start gap-2 rounded-compact border border-line bg-surface-muted px-3 py-2 text-label text-text-muted',
  warn: 'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-label text-text-primary',
  danger:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-label text-text-primary',
  stack: 'flex flex-col gap-3 px-5 py-4',
  bodyField: 'min-h-80 font-mono text-body',
  previewPane:
    'min-h-80 overflow-auto rounded-compact border border-line bg-surface-canvas px-4 py-3',
  editorTabs: 'mb-3',
  counter: 'text-caption tabular-nums text-text-secondary',

  // Markdown preview
  md: 'flex flex-col gap-2 text-body text-text-primary',
  mdHeading: {
    1: 'font-display text-heading font-bold text-text-primary',
    2: 'font-display text-title font-bold text-text-primary',
    3: 'text-body font-bold text-text-primary',
  },
  mdP: 'leading-relaxed',
  mdUl: 'ml-5 list-disc',
  mdOl: 'ml-5 list-decimal',
  mdPre:
    'overflow-auto rounded-compact bg-surface-muted p-2 font-mono text-label text-text-primary',
  mdCode: 'rounded bg-surface-muted px-1 font-mono text-label',
  mdLink: 'underline decoration-dotted',
  mdLinkTarget: 'font-mono text-caption text-text-secondary',
  mdEmpty: 'text-label text-text-secondary',

  // Diff
  diff: 'overflow-auto rounded-compact border border-line bg-surface-card font-mono text-label',
  diffSummary: 'flex flex-wrap items-center gap-3 text-label text-text-secondary',
  diffAdded: 'flex gap-2 bg-mint-soft px-2 py-0.5 text-text-primary',
  diffRemoved: 'flex gap-2 bg-danger-soft px-2 py-0.5 text-danger-ink',
  diffSame: 'flex gap-2 px-2 py-0.5 text-text-muted',
  diffSkip: 'px-2 py-0.5 text-caption italic text-text-secondary',
  diffSign: 'w-3 shrink-0 select-none text-center font-bold',
  diffText: 'whitespace-pre-wrap break-words',
  fieldDiff: 'flex flex-col gap-1',
  fieldDiffLabel: 'text-caption font-semibold uppercase tracking-wide text-text-secondary',
  fieldFrom: 'rounded bg-danger-soft px-1.5 py-0.5 text-danger-ink line-through',
  fieldTo: 'rounded bg-mint-soft px-1.5 py-0.5 text-text-primary',
  fieldSame: 'text-label text-text-secondary',

  // Versions
  versionList: 'divide-y divide-line',
  versionRow: 'flex flex-wrap items-start justify-between gap-3 px-5 py-3',
  versionTitle: 'text-body font-semibold text-text-primary',
  versionMeta: 'mt-0.5 text-caption text-text-secondary',
  versionReason: 'mt-1 text-label text-text-muted',
  compareBar: 'flex flex-wrap items-end gap-3 border-b border-line px-5 py-3',

  // Feedback
  feedbackList: 'flex flex-col gap-3 p-4',
  feedbackItem: 'rounded-card border border-line bg-surface-card p-4',
  feedbackHead: 'flex flex-wrap items-center justify-between gap-2',
  feedbackBadges: 'flex flex-wrap items-center gap-1.5',
  feedbackMeta: 'text-caption tabular-nums text-text-secondary',
  feedbackText:
    'mt-3 whitespace-pre-wrap rounded-compact bg-surface-muted px-3 py-2 text-body text-text-primary',
  feedbackClamp: 'line-clamp-4',
  sourceList: 'mt-3 flex flex-col gap-1.5',
  sourceItem: 'flex flex-wrap items-baseline gap-2 text-label text-text-primary',
  sourceIndex: 'font-mono text-caption text-text-secondary',
  sourceDesc: 'text-caption text-text-secondary',
  chips: 'mt-3 flex flex-wrap items-center gap-1.5',
  privacyNote:
    'flex items-start gap-2 border-b border-line bg-surface-muted px-4 py-2 text-label text-text-muted',

  // Kill switch
  switchState: 'flex flex-wrap items-center gap-4',
  stateOn: 'font-display text-heading font-extrabold text-mint-ink',
  stateOff: 'font-display text-heading font-extrabold text-danger-ink',
  stateMeta: 'text-label text-text-muted',
  links: 'flex flex-wrap items-center gap-3 text-label',
  // Coverage check (GoGo-CMS#266)
  coverageForm: 'flex flex-wrap items-end gap-3 border-b border-line px-5 py-4',
  coverageQuestion: 'min-w-64 flex-1',
  coverageList: 'flex flex-col divide-y divide-line',
  coverageItem: 'flex flex-col gap-1 py-3 first:pt-0 last:pb-0',
  link: 'inline-flex min-h-11 items-center font-semibold text-accent-primary underline-offset-2 hover:underline',
} as const
