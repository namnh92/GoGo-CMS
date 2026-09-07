import type { ReactNode } from 'react'
import { cn } from './cn'
import { AlertIcon, CheckIcon, ClockIcon, InfoIcon } from './icons'

export type Tone = 'neutral' | 'coral' | 'lavender' | 'mint' | 'amber' | 'danger'

/** Glyph paired with every tone so state survives greyscale. */
export type BadgeShape = 'dot' | 'check' | 'alert' | 'clock' | 'info'

// The `-ink` text colours exist because the obvious pairing did not read: the
// tone on its own -soft fill measured 3.64 (coral), 3.37 (lavender), 2.30
// (mint), 2.24 (amber) and 3.74 (danger) against a 4.5 threshold, on the column
// an editor scans most. Same hue, dark enough to read. The undarkened tones
// stay in use for borders and for the status dots on the ops dashboard, where
// they are shapes rather than text.
const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-text-muted border-line-strong',
  coral: 'bg-coral-soft text-coral-ink border-coral/35',
  lavender: 'bg-lavender-soft text-lavender-ink border-lavender/35',
  mint: 'bg-mint-soft text-mint-ink border-mint/40',
  amber: 'bg-amber-soft text-amber-ink border-amber/40',
  danger: 'bg-danger-soft text-danger-ink border-danger/40',
}

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: Tone
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/**
 * Status pill. Colour is never the sole signal — every tone ships with a
 * shape/icon so the state survives greyscale and colour-vision differences.
 */
export function StatusBadge({
  tone,
  label,
  shape = 'dot',
}: {
  tone: Tone
  label: string
  shape?: BadgeShape
}) {
  const glyph =
    shape === 'check' ? (
      <CheckIcon size={11} />
    ) : shape === 'alert' ? (
      <AlertIcon size={11} />
    ) : shape === 'clock' ? (
      <ClockIcon size={11} />
    ) : shape === 'info' ? (
      <InfoIcon size={11} />
    ) : (
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    )
  return (
    <Badge tone={tone} icon={glyph}>
      {label}
    </Badge>
  )
}
