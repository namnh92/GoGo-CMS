export const styles = {
  sourceGrid: 'grid gap-3 md:grid-cols-2',
  sourceOption: 'flex flex-col gap-2 rounded-card border-2 p-4 text-left transition-colors',
  sourceOptionActive: 'border-coral bg-coral-soft/40',
  sourceOptionIdle: 'border-line hover:border-line-strong',
  sourceTitle: 'font-display text-sm font-bold text-text',
  sourceHint: 'text-xs text-text-muted',
  dropZone:
    'flex min-h-32 flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong bg-surface-muted p-6 text-center',
  fileName: 'text-[13px] font-semibold text-text',
  modeGrid: 'grid gap-3 md:grid-cols-3',
  modeOption: 'flex flex-col gap-1 rounded-card border-2 p-3 text-left',
  mappingTable: 'w-full border-collapse text-[13px]',
  mappingHeader:
    'px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-text-subtle',
  mappingCell: 'border-t border-line px-3 py-2 align-middle',
  sample: 'font-mono text-[11px] text-text-subtle',
  required: 'ml-1 text-danger',
  footer: 'flex flex-wrap items-center justify-between gap-3',
  warn: 'flex items-start gap-2 rounded-compact border border-amber/45 bg-amber-soft px-3 py-2 text-xs text-text',
} as const
