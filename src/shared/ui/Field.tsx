import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from './cn'

const CONTROL =
  'w-full rounded-compact border border-line-strong bg-surface px-3 py-2.5 text-sm text-text ' +
  'placeholder:text-text-subtle transition-colors duration-[var(--duration-fast)] ' +
  'hover:border-neutral-500 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-subtle ' +
  'aria-[invalid=true]:border-danger'

/**
 * The id a control must point `aria-describedby` at so its message is
 * announced with it. Derived from the control id so the two cannot drift.
 */
function describedById(controlId: string, kind: 'error' | 'hint'): string {
  return `${controlId}-${kind}`
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  required?: boolean
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  // Without an id on the message and `aria-describedby` on the control, a
  // screen reader announces the field and stops — the reason it was rejected
  // sits next to it visually and nowhere at all in the accessibility tree.
  const messageId = htmlFor ? describedById(htmlFor, error ? 'error' : 'hint') : undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-semibold text-text-muted">
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        // Error carries an icon glyph as well as colour.
        <p
          id={messageId}
          role="alert"
          className="flex items-start gap-1 text-xs font-medium text-danger"
        >
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The `aria-describedby` a control needs so its error (or, failing that, its
 * hint) is announced with it — merged with whatever the caller already passed,
 * never replacing it.
 */
function describedBy(
  inputId: string,
  error: string | undefined,
  hint: ReactNode,
  own: string | undefined,
): string | undefined {
  const message = error
    ? describedById(inputId, 'error')
    : hint
      ? describedById(inputId, 'hint')
      : undefined
  const ids = [own, message].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode
  hint?: ReactNode
  error?: string
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, error, className, id, required, 'aria-describedby': ownDescribedBy, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={inputId}
      className={className}
    >
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint, ownDescribedBy)}
        required={required}
        className={CONTROL}
        {...props}
      />
    </Field>
  )
})

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: ReactNode
  hint?: ReactNode
  error?: string
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  {
    label,
    hint,
    error,
    className,
    id,
    required,
    rows = 3,
    'aria-describedby': ownDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={inputId}
      className={className}
    >
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint, ownDescribedBy)}
        required={required}
        className={cn(CONTROL, 'resize-y')}
        {...props}
      />
    </Field>
  )
})

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode
  hint?: ReactNode
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    hint,
    error,
    className,
    id,
    required,
    children,
    'aria-describedby': ownDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={inputId}
      className={className}
    >
      <select
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint, ownDescribedBy)}
        required={required}
        className={cn(CONTROL, 'pr-8')}
        {...props}
      >
        {children}
      </select>
    </Field>
  )
})

/** Bare select for toolbars, where a visible label would waste a row. */
export const InlineSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { label: string }
>(function InlineSelect({ label, className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-label={label}
      // Built from the same tokens as CONTROL but without `w-full`, which
      // would fight the auto width a toolbar control needs.
      className={cn(
        'min-h-11 rounded-compact border border-line-strong bg-surface px-3 pr-8 text-[13px] text-text',
        'transition-colors duration-[var(--duration-fast)] hover:border-neutral-500',
        'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-subtle',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
})

export function SearchInput({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className={cn('relative', className)}>
      <input type="search" aria-label={label} className={cn(CONTROL, 'min-h-11 pl-9')} {...props} />
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle">
        <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="7.75" cy="7.75" r="5.25" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M11.75 11.75 15.5 15.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  describedBy,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  describedBy?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-11 w-11 items-center justify-center rounded-compact disabled:cursor-not-allowed disabled:opacity-45',
      )}
    >
      <span
        className={cn(
          'relative flex h-5 w-9 items-center rounded-pill transition-colors duration-[var(--duration-fast)]',
          checked ? 'bg-mint' : 'bg-neutral-300',
        )}
      >
        <span
          className={cn(
            'absolute h-3.5 w-3.5 rounded-full bg-neutral-0 transition-[left] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
            checked ? 'left-[1.15rem]' : 'left-[0.15rem]',
          )}
        />
        {/* Shape cue so the state does not rely on colour alone. */}
        <span className="sr-only">{checked ? 'on' : 'off'}</span>
      </span>
    </button>
  )
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(node) => {
        if (node) node.indeterminate = Boolean(indeterminate) && !checked
      }}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 cursor-pointer rounded border-line-strong accent-[var(--color-coral)]"
    />
  )
}
