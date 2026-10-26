import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md'

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-accent-primary text-text-on-accent hover:bg-accent-pressed active:bg-accent-pressed ' +
    // Disabled is a neutral surface, not a faded accent: white on a 45% coral
    // was about 2:1, and a washed-out CTA still reads as the thing to press.
    // surface-subtle is mobile's disabled fill; text-muted on it is 7.66.
    'disabled:bg-surface-subtle disabled:text-text-muted',
  secondary:
    'bg-surface-card text-text-primary border border-line-strong hover:bg-surface-muted disabled:text-text-secondary',
  ghost: 'bg-transparent text-text-muted hover:bg-surface-canvas disabled:text-text-secondary',
  danger:
    'bg-surface-card text-danger-ink border border-danger/40 hover:bg-danger-soft disabled:text-danger-ink/45',
  success:
    'bg-surface-card text-mint-ink border border-mint/45 hover:bg-mint-soft disabled:text-mint-ink/45',
}

const SIZE: Record<Size, string> = {
  // Dense layout, but the 44px minimum target still holds: `sm` tightens the
  // horizontal padding and the type scale, never the hit area.
  sm: 'text-body px-3 min-h-11',
  md: 'text-sm px-4 min-h-11',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
  iconLeft?: ReactNode
  iconRight?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading,
    iconLeft,
    iconRight,
    className,
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      // A loading button stays focusable but announces its busy state.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-compact font-semibold',
        'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
        'disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  )
})

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path
        d="M12.5 7A5.5 5.5 0 007 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  tone?: 'default' | 'danger'
}

/** Icon-only control. `label` is required — never ship a nameless button. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tone = 'default', className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-11 w-11 items-center justify-center rounded-compact',
        'transition-colors duration-[var(--duration-fast)]',
        tone === 'danger'
          ? 'text-danger-ink hover:bg-danger-soft'
          : 'text-text-secondary hover:bg-surface-canvas hover:text-text-primary',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
})
