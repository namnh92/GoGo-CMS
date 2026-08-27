import type { ReactNode } from 'react'
import { cn } from './cn'
import { AlertIcon, CheckIcon, ClockIcon, InfoIcon } from './icons'

export type Tone = 'neutral' | 'coral' | 'lavender' | 'mint' | 'amber' | 'danger'

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-text-muted border-line-strong',
  coral: 'bg-coral-soft text-coral-deep border-coral/35',
  lavender: 'bg-lavender-soft text-lavender border-lavender/35',
  mint: 'bg-mint-soft text-mint border-mint/40',
  amber: 'bg-amber-soft text-amber border-amber/40',
  danger: 'bg-danger-soft text-danger border-danger/40',
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
  shape?: 'dot' | 'check' | 'alert' | 'clock' | 'info'
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
