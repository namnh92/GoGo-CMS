export const styles = {
  wrap: 'flex flex-col gap-3',
  intro: 'text-xs text-text-secondary',
  row: 'flex flex-wrap items-end gap-2',
  input: 'min-w-[18rem] flex-1',
  reading: 'flex flex-wrap items-center gap-2 text-xs text-text-muted',
  // Mint: a resolution is an answer, not a warning. The panel is titled and
  // carries a glyph, so the colour is never the only signal.
  preview: 'rounded-compact border border-mint/50 bg-mint-soft/40 px-3 py-2.5',
  previewTitle: 'flex items-center gap-1.5 text-body font-semibold text-text-primary',
  previewName: 'mt-1.5 text-sm font-semibold text-text-primary',
  previewAddress: 'mt-0.5 text-xs text-text-muted',
  previewFacts: 'mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted',
  previewCoords: 'font-mono text-caption',
  previewUnits: 'mt-1.5 text-xs font-medium text-text-primary',
  // A definition list, not a table: four facts at most, and each one is absent
  // rather than dashed when the provider publishes none.
  providerFacts: 'mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs',
  providerLabel: 'text-caption text-text-secondary',
  providerValue: 'text-xs text-text-primary',
  providerLink:
    'text-xs font-medium text-accent-primary underline underline-offset-2 ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
  providerNote: 'mt-1.5 text-caption text-text-secondary',
  staleNote: 'mt-2 flex items-center gap-1.5 text-caption font-medium text-text-muted',
  attribution: 'mt-2 text-caption text-text-secondary',
  actions: 'mt-3 flex flex-wrap items-center gap-2',
  // Amber for the two states that are a question rather than an answer.
  question: 'rounded-compact border border-amber/50 bg-amber-soft/50 px-3 py-2.5',
  questionTitle: 'flex items-center gap-1.5 text-body font-semibold text-text-primary',
  questionBody: 'mt-1 text-xs text-text-muted',
  candidateList: 'mt-2 flex flex-col gap-1.5',
  // A row is a control now (#160): full width, left-aligned like the text it
  // replaced, and tall enough to hit — `min-h-11` is the 44px target, not decor.
  candidate:
    'flex w-full min-h-11 flex-col items-start gap-0.5 rounded-compact bg-surface-card px-2.5 py-1.5 text-left ' +
    'transition-colors duration-[var(--duration-fast)] hover:bg-surface-muted ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ' +
    'disabled:cursor-not-allowed disabled:opacity-60',
  candidateName: 'flex items-center gap-1.5 text-xs font-semibold text-text-primary',
  candidateSpinner: 'text-text-muted',
  candidateAddress: 'text-caption text-text-muted',
  problem: 'rounded-compact border border-danger/40 bg-danger-soft/50 px-3 py-2.5',
  problemTitle: 'flex items-center gap-1.5 text-body font-semibold text-danger-ink',
  problemBody: 'mt-1 text-xs text-text-muted',
}
