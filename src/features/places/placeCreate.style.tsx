export const styles = {
  form: 'flex max-w-3xl flex-col gap-5',
  fieldRow: 'grid gap-4 sm:grid-cols-2',
  actions: 'flex flex-wrap items-center gap-3',
  hint: 'text-xs text-text-subtle',
  // Amber, not danger: a suspected duplicate is a question for the editor, not
  // a rejected save. Colour is never the only signal — the panel is titled and
  // carries an icon.
  duplicatePanel: 'rounded-compact border border-amber/50 bg-amber-soft/50 px-3 py-2.5',
  duplicateTitle: 'flex items-center gap-1.5 text-[13px] font-semibold text-text',
  duplicateBody: 'mt-1 text-xs text-text-muted',
  duplicateList: 'mt-2 flex flex-col gap-1 text-xs text-text-muted',
  duplicateItem: 'rounded-compact bg-surface px-2.5 py-1.5 font-medium text-text',
  candidateRow: 'flex flex-wrap items-center gap-2',
  candidateName: 'font-semibold text-text',
  candidateMeta: 'mt-0.5 text-xs font-normal text-text-muted',
  // 44px tall hit area without inflating the row: the link is the only action.
  candidateLink:
    'mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-coral-ink underline underline-offset-2 ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-coral',
  duplicateActions: 'mt-3 flex flex-wrap items-center gap-2',
  errorPanel: 'rounded-compact border border-danger/40 bg-danger-soft/50 px-3 py-2.5',
  errorTitle: 'flex items-center gap-1.5 text-[13px] font-semibold text-danger-ink',
  errorText: 'mt-1 text-xs text-text-muted',
  errorList: 'mt-1.5 flex flex-col gap-1 text-xs text-text-muted',
  errorField: 'font-mono text-[11px] font-semibold text-danger-ink',
}
