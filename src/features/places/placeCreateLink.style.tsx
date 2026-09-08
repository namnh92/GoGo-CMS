export const styles = {
  wrap: 'flex flex-col gap-3',
  intro: 'text-xs text-text-subtle',
  row: 'flex flex-wrap items-end gap-2',
  input: 'min-w-[18rem] flex-1',
  reading: 'flex flex-wrap items-center gap-2 text-xs text-text-muted',
  // Mint: a resolution is an answer, not a warning. The panel is titled and
  // carries a glyph, so the colour is never the only signal.
  preview: 'rounded-compact border border-mint/50 bg-mint-soft/40 px-3 py-2.5',
  previewTitle: 'flex items-center gap-1.5 text-[13px] font-semibold text-text',
  previewName: 'mt-1.5 text-sm font-semibold text-text',
  previewAddress: 'mt-0.5 text-xs text-text-muted',
  previewFacts: 'mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted',
  previewCoords: 'font-mono text-[11px]',
  previewUnits: 'mt-1.5 text-xs font-medium text-text',
  // A definition list, not a table: four facts at most, and each one is absent
  // rather than dashed when the provider publishes none.
  providerFacts: 'mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs',
  providerLabel: 'text-[11px] text-text-subtle',
  providerValue: 'text-xs text-text',
  providerLink:
    'text-xs font-medium text-coral underline underline-offset-2 ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-coral',
  providerNote: 'mt-1.5 text-[11px] text-text-subtle',
  staleNote: 'mt-2 flex items-center gap-1.5 text-[11px] font-medium text-text-muted',
  attribution: 'mt-2 text-[11px] text-text-subtle',
  actions: 'mt-3 flex flex-wrap items-center gap-2',
  // Amber for the two states that are a question rather than an answer.
  question: 'rounded-compact border border-amber/50 bg-amber-soft/50 px-3 py-2.5',
  questionTitle: 'flex items-center gap-1.5 text-[13px] font-semibold text-text',
  questionBody: 'mt-1 text-xs text-text-muted',
  candidateList: 'mt-2 flex flex-col gap-1.5',
  // A row is a control now (#160): full width, left-aligned like the text it
  // replaced, and tall enough to hit — `min-h-11` is the 44px target, not decor.
  candidate:
    'flex w-full min-h-11 flex-col items-start gap-0.5 rounded-compact bg-surface px-2.5 py-1.5 text-left ' +
    'transition-colors duration-[var(--duration-fast)] hover:bg-surface-muted ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-coral ' +
    'disabled:cursor-not-allowed disabled:opacity-60',
  candidateName: 'flex items-center gap-1.5 text-xs font-semibold text-text',
  candidateSpinner: 'text-text-muted',
  candidateAddress: 'text-[11px] text-text-muted',
  problem: 'rounded-compact border border-danger/40 bg-danger-soft/50 px-3 py-2.5',
  problemTitle: 'flex items-center gap-1.5 text-[13px] font-semibold text-danger-ink',
  problemBody: 'mt-1 text-xs text-text-muted',
}
