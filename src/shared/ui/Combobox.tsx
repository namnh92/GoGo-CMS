import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useT } from '@/shared/i18n/i18n'
import { Field } from './Field'
import { Button, Spinner } from './Button'
import { AlertIcon, CheckIcon, CloseIcon, InboxIcon, ShieldOffIcon } from './icons'
import { cn } from './cn'

/**
 * A searchable single-select over a **server-owned vocabulary**.
 *
 * `<Select>` cannot do this job: the list is fetched, so it has a loading, an
 * empty, an error and a permission-denied state of its own, and a `<select>`
 * has nowhere to put any of them — an editor would see an empty dropdown and
 * have no way to tell "the catalog has no rows" from "the call failed".
 *
 * It stores a stable key and searches human labels, which is the second thing
 * a `<select>` of pre-rendered `<option>`s cannot do over a catalog of any
 * size.
 */
export type ComboboxOption = {
  /** The stable key that gets stored. Never a display string. */
  value: string
  /** What the editor reads and types against. */
  label: string
  /** A second line: a count, a city, why this row is unusual. */
  meta?: string
  /** Optional heading this option is filed under. */
  group?: string
  /** A short word carried next to the label — never colour on its own. */
  badge?: string
}

/**
 * `denied` is deliberately not folded into `error`: a 403 is a fact about the
 * account, not a failure to retry, and offering "thử lại" for it teaches an
 * editor to keep clicking a button that cannot ever work.
 */
export type ComboboxStatus = 'pending' | 'error' | 'success' | 'denied'

export type ComboboxProps = {
  label: ReactNode
  /** Keeps the label in the accessibility tree while hiding it visually. */
  labelHidden?: boolean
  hint?: ReactNode
  /** A validation message for the field itself, not for the fetch. */
  error?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  /** The stored key, or null when the field is empty. */
  value: string | null
  /**
   * How the stored key reads when the popup is closed. The owner resolves it,
   * because only the owner knows whether an unresolvable key is a retired row
   * or one the catalog has never heard of.
   */
  valueLabel?: string
  onChange: (value: string | null) => void
  query: string
  onQueryChange: (query: string) => void
  options: ComboboxOption[]
  status: ComboboxStatus
  /** What went wrong, in Vietnamese, when `status` is `error`. */
  errorMessage?: string
  onRetry?: () => void
  /** The catalog genuinely has no rows — a different fact from "no match". */
  emptyLabel?: string
  /** The catalog has rows, none of them match what was typed. */
  noMatchLabel?: string
  className?: string
  inputClassName?: string
  id?: string
}

export function Combobox({
  label,
  labelHidden,
  hint,
  error,
  required,
  disabled,
  placeholder,
  value,
  valueLabel,
  onChange,
  query,
  onQueryChange,
  options,
  status,
  errorMessage,
  onRetry,
  emptyLabel,
  noMatchLabel,
  className,
  inputClassName,
  id,
}: ComboboxProps) {
  const t = useT()
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listId = `${inputId}-listbox`
  const statusId = `${inputId}-listbox-status`

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const optionId = useCallback((index: number) => `${inputId}-option-${index}`, [inputId])

  /** Group headings render in first-seen order; ungrouped rows come first. */
  const groups = useMemo(() => {
    const order: (string | undefined)[] = []
    const byGroup = new Map<string | undefined, { option: ComboboxOption; index: number }[]>()
    options.forEach((option, index) => {
      const key = option.group
      if (!byGroup.has(key)) {
        byGroup.set(key, [])
        order.push(key)
      }
      byGroup.get(key)?.push({ option, index })
    })
    return order.map((key) => ({ group: key, rows: byGroup.get(key) ?? [] }))
  }, [options])

  const close = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
    // The typed fragment is not a value; dropping it stops a half-typed label
    // from reading like a selection.
    onQueryChange('')
  }, [onQueryChange])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, close])

  const select = (option: ComboboxOption) => {
    onChange(option.value)
    close()
    inputRef.current?.focus()
  }

  const move = (delta: number) => {
    if (options.length === 0) return
    setActiveIndex((current) => {
      const next = current + delta
      if (next < 0) return options.length - 1
      if (next >= options.length) return 0
      return next
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!open) {
          setOpen(true)
          setActiveIndex(options.length > 0 ? 0 : -1)
        } else move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        if (!open) {
          setOpen(true)
          setActiveIndex(options.length - 1)
        } else move(-1)
        break
      case 'Home':
        if (!open) break
        event.preventDefault()
        setActiveIndex(options.length > 0 ? 0 : -1)
        break
      case 'End':
        if (!open) break
        event.preventDefault()
        setActiveIndex(options.length - 1)
        break
      case 'Enter': {
        if (!open) break
        // Enter inside a combobox commits the highlighted row; it must not
        // also submit the form the field sits in.
        event.preventDefault()
        const active = options[activeIndex]
        if (active) select(active)
        break
      }
      case 'Escape':
        if (!open) break
        event.preventDefault()
        close()
        break
      case 'Tab':
        if (open) close()
        break
      default:
        break
    }
  }

  const displayValue = open ? query : (valueLabel ?? value ?? '')

  return (
    <Field
      label={labelHidden ? <span className="sr-only">{label}</span> : label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={inputId}
      className={className}
    >
      <div ref={rootRef} className="relative">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            id={inputId}
            role="combobox"
            type="text"
            autoComplete="off"
            aria-expanded={open}
            // Only while the popup exists: pointing at an id that is not in
            // the document is a dangling reference, not a relationship.
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={
              [error ? `${inputId}-error` : hint ? `${inputId}-hint` : null, open ? statusId : null]
                .filter(Boolean)
                .join(' ') || undefined
            }
            disabled={disabled}
            required={required}
            placeholder={placeholder}
            value={displayValue}
            className={cn(
              'min-h-11 w-full rounded-compact border border-line-strong bg-surface px-3 py-2.5 text-sm text-text',
              'placeholder:text-text-subtle transition-colors duration-[var(--duration-fast)]',
              'hover:border-neutral-500 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-subtle',
              'aria-[invalid=true]:border-danger',
              inputClassName,
            )}
            onChange={(event) => {
              if (!open) setOpen(true)
              setActiveIndex(-1)
              onQueryChange(event.target.value)
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
          />
          {value && !disabled ? (
            <button
              type="button"
              // Clearing is the only way to send `null` for this field, so it
              // is a control in its own right, not a decoration.
              aria-label={t('combobox.clear')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-compact text-text-subtle hover:bg-surface-sunken hover:text-text"
              onClick={() => {
                onChange(null)
                onQueryChange('')
                inputRef.current?.focus()
              }}
            >
              <CloseIcon size={12} />
            </button>
          ) : null}
        </div>

        {open ? (
          <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-card border border-line-strong bg-surface shadow-lg">
            {/*
              One node per message, and it is the live region: a hidden copy
              of the same sentence would be read twice and drift the moment
              somebody edited only one of them.

              The four states are worded differently on purpose. "The catalog
              has no rows" and "the call failed" are different facts, and an
              editor who cannot tell them apart cannot tell whether to write to
              whoever owns the data or to press the button again.
            */}
            <div id={statusId} role="status" aria-live="polite">
              {status === 'pending' ? (
                <p className="flex items-center gap-2 px-3 py-4 text-xs text-text-muted">
                  <Spinner /> {t('combobox.loading')}
                </p>
              ) : status === 'denied' ? (
                <div className="flex items-start gap-2 px-3 py-4 text-xs text-text-muted">
                  <ShieldOffIcon size={14} />
                  <span>
                    <span className="block font-semibold text-text">{t('state.denied')}</span>
                    {t('combobox.deniedHint')}
                  </span>
                </div>
              ) : status === 'error' ? (
                <div className="flex items-start gap-2 px-3 py-4 text-xs text-text-muted">
                  <AlertIcon size={14} />
                  <span>
                    <span className="block font-semibold text-danger">{t('combobox.error')}</span>
                    {errorMessage}
                  </span>
                </div>
              ) : options.length === 0 ? (
                <p className="flex items-start gap-2 px-3 py-4 text-xs text-text-muted">
                  <InboxIcon size={14} />
                  <span>
                    {query.trim()
                      ? (noMatchLabel ?? t('combobox.noMatch', { query: query.trim() }))
                      : (emptyLabel ?? t('combobox.empty'))}
                  </span>
                </p>
              ) : (
                <p className="sr-only">{t('combobox.count', { count: options.length })}</p>
              )}
            </div>
            {/* Outside the live region: a retry button is a control, not news. */}
            {status === 'error' && onRetry ? (
              <div className="px-3 pb-3">
                <Button size="sm" variant="secondary" onClick={onRetry}>
                  {t('state.retry')}
                </Button>
              </div>
            ) : null}

            {/*
              `div`, not `ul`: a listbox owns `option` and `group` children,
              and a `li` wrapper around the options would put a role the
              pattern does not allow between them.
            */}
            <div
              id={listId}
              role="listbox"
              aria-label={typeof label === 'string' ? label : undefined}
            >
              {groups.map(({ group, rows }) => {
                const items = rows.map(({ option, index }) => {
                  const selected = option.value === value
                  return (
                    <div
                      key={option.value}
                      id={optionId(index)}
                      role="option"
                      aria-selected={selected}
                      className={cn(
                        'flex min-h-11 cursor-pointer items-center justify-between gap-2 border-l-2 px-3 py-2 text-[13px]',
                        index === activeIndex
                          ? 'border-l-coral bg-surface-sunken'
                          : 'border-l-transparent',
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => {
                        // Keeps focus on the input so blur never closes the
                        // popup before the click lands.
                        event.preventDefault()
                      }}
                      onClick={() => select(option)}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-text">{option.label}</span>
                          {option.badge ? (
                            <span className="shrink-0 rounded-pill border border-line-strong bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
                              {option.badge}
                            </span>
                          ) : null}
                        </span>
                        {option.meta ? (
                          <span className="block truncate text-[11px] text-text-subtle">
                            {option.meta}
                          </span>
                        ) : null}
                      </span>
                      {/* A glyph, so selection is never colour alone. */}
                      <span className="shrink-0 text-coral" aria-hidden="true">
                        {selected ? <CheckIcon size={14} /> : null}
                      </span>
                    </div>
                  )
                })
                if (!group) return items
                return (
                  <div key={group} role="group" aria-label={group}>
                    <p className="sticky top-0 bg-surface-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                      {group}
                    </p>
                    {items}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    </Field>
  )
}
