import type { ReactNode } from 'react'
import { cn } from './cn'

/** Opaque panel. The CMS never puts glass behind data. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn('rounded-card border border-line bg-surface', className)}>
      {children}
    </section>
  )
}

export function CardHeader({
  title,
  hint,
  actions,
  className,
}: {
  title: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-line px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="font-display text-[15px] font-bold text-text">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-text-subtle">{hint}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>
}

export function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  tone?: 'neutral' | 'positive' | 'negative'
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <p className="text-xs font-semibold text-text-subtle">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-text tabular-nums">{value}</p>
      {sub ? (
        <p
          className={cn(
            'mt-1 text-[11px]',
            tone === 'positive'
              ? 'text-mint'
              : tone === 'negative'
                ? 'text-danger'
                : 'text-text-subtle',
          )}
        >
          {/* Arrow glyph carries the direction so colour is not the only cue. */}
          {tone === 'positive' ? '▲ ' : tone === 'negative' ? '▼ ' : ''}
          {sub}
        </p>
      ) : null}
    </div>
  )
}
