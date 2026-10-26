import { cn } from './cn'

export type TabItem<T extends string> = { id: T; label: string; count?: number }

/**
 * Underlined tab strip. Implements the roving-tabindex keyboard pattern so a
 * large filter row stays usable without a mouse.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (next: T) => void
  label: string
  className?: string
}) {
  const activeIndex = items.findIndex((item) => item.id === value)

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex gap-0 border-b border-line', className)}
    >
      {items.map((item) => {
        const selected = item.id === value
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
              event.preventDefault()
              const delta = event.key === 'ArrowRight' ? 1 : -1
              const next = items[(activeIndex + delta + items.length) % items.length]
              if (next) onChange(next.id)
            }}
            onClick={() => onChange(item.id)}
            className={cn(
              '-mb-px flex min-h-11 items-center gap-1.5 border-b-2 px-4 text-body font-semibold',
              'transition-colors duration-[var(--duration-fast)]',
              selected
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {item.label}
            {typeof item.count === 'number' ? (
              <span
                className={cn(
                  'rounded-pill px-1.5 py-0.5 text-caption tabular-nums',
                  selected
                    ? 'bg-accent-soft text-accent-on-soft'
                    : 'bg-surface-canvas text-text-secondary',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
