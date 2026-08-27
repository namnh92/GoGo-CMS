import { cn } from './cn'
import type { Tone } from './Badge'

const BAR: Record<Tone, string> = {
  neutral: 'bg-neutral-500',
  coral: 'bg-coral',
  lavender: 'bg-lavender',
  mint: 'bg-mint',
  amber: 'bg-amber',
  danger: 'bg-danger',
}

export function ProgressBar({
  value,
  max,
  tone = 'coral',
  label,
  caption,
  className,
}: {
  value: number
  max: number
  tone?: Tone
  label: string
  caption?: string
  className?: string
}) {
  const safeMax = max > 0 ? max : 1
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100))
  return (
    <div className={cn('min-w-[9rem]', className)}>
      {caption ? <p className="mb-1 text-[11px] tabular-nums text-text-muted">{caption}</p> : null}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunken"
      >
        <div
          className={cn(
            'h-full rounded-pill transition-[width] duration-[var(--duration-base)]',
            BAR[tone],
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

/** Compact 0..1 confidence meter used on import rows and duplicate pairs. */
export function ConfidenceMeter({ value, label }: { value: number; label: string }) {
  const percent = Math.round(value * 100)
  const tone: Tone = percent >= 90 ? 'mint' : percent >= 70 ? 'amber' : 'danger'
  return (
    <div className="flex items-center gap-2">
      <ProgressBar value={percent} max={100} tone={tone} label={label} className="w-16 min-w-0" />
      <span className="text-xs font-semibold tabular-nums text-text-muted">{percent}%</span>
    </div>
  )
}
