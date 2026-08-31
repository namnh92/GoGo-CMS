import { cn } from './cn'

export type StepDescriptor = { id: string; label: string }

/**
 * Progress through a multi-step form.
 *
 * Extracted from the import wizard because every flow the CMS backlog adds is
 * another wizard, and a copied step bar is how two of them end up disagreeing
 * about what "done" looks like.
 *
 * The list wraps rather than scrolling sideways: a longer flow pushes steps
 * onto a second line where they stay readable and reachable, instead of
 * hiding them behind a horizontal scroll the keyboard has to discover.
 */
export function Stepper({
  steps,
  current,
  className,
}: {
  steps: StepDescriptor[]
  current: string
  className?: string
}) {
  const currentIndex = steps.findIndex((step) => step.id === current)

  return (
    <ol className={cn('flex flex-wrap items-center gap-2 text-[12px]', className)}>
      {steps.map((step, index) => {
        const active = step.id === current
        const done = currentIndex > index
        return (
          <li
            key={step.id}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-2 rounded-pill border px-3 font-semibold',
              active
                ? 'border-coral bg-coral-soft text-coral-deep'
                : done
                  ? 'border-mint/45 bg-mint-soft text-mint'
                  : 'border-line-strong bg-surface text-text-subtle',
            )}
          >
            {/* Number and tick are decoration: the label is the name of the
                step, and `aria-current` is what marks where we are. */}
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[10px]"
              aria-hidden="true"
            >
              {done ? '✓' : index + 1}
            </span>
            {step.label}
          </li>
        )
      })}
    </ol>
  )
}
