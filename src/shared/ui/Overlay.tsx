import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/shared/i18n/i18n'
import { Button, IconButton } from './Button'
import { CloseIcon } from './icons'
import { cn } from './cn'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Escape to close + focus trap + focus restore, shared by drawer and modal.
 *
 * `initialFocusRef` names the control that should receive focus instead of the
 * first focusable one. A dialog whose whole purpose is an input — the command
 * palette — must not open with focus parked on its close button.
 */
function useDialogBehaviour(
  open: boolean,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const ref = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement | null
    const node = ref.current
    const preferred = initialFocusRef?.current
    if (preferred) preferred.focus()
    else node?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      restoreTo.current?.focus()
    }
  }, [open, onClose, initialFocusRef])

  return ref
}

/**
 * Side drawer. This — plus Modal — is the ONLY place glass/blur is allowed:
 * an overlay is a hierarchy material, a table is not.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  footer,
  width = 'md',
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  width?: 'md' | 'lg'
  children: ReactNode
}) {
  const t = useT()
  const ref = useDialogBehaviour(open, onClose)
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-[var(--color-backdrop)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'relative flex h-full w-full flex-col border-l border-line bg-surface shadow-2xl',
          width === 'lg' ? 'max-w-3xl' : 'max-w-xl',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-text">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-text-muted">{description}</p> : null}
          </div>
          <IconButton label={t('action.close')} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer ? <footer className="border-t border-line px-5 py-4">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  initialFocusRef,
  bodyClassName,
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  /** Control to focus on open, instead of the first focusable descendant. */
  initialFocusRef?: RefObject<HTMLElement | null>
  bodyClassName?: string
  children?: ReactNode
}) {
  const t = useT()
  const ref = useDialogBehaviour(open, onClose, initialFocusRef)
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[var(--color-backdrop)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-sheet border border-line bg-surface shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-text">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-text-muted">{description}</p> : null}
          </div>
          <IconButton label={t('action.close')} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </header>
        <div className={cn('flex-1 overflow-auto px-5 py-4', bodyClassName)}>{children}</div>
        {footer ? <footer className="border-t border-line px-5 py-4">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}

export type ChangeLine = { label: string; from?: ReactNode; to?: ReactNode; note?: ReactNode }

/**
 * Confirmation for destructive/irreversible work.
 *
 * A bare "are you sure?" is explicitly not acceptable in this repo: the dialog
 * must show WHAT changes. Callers pass the concrete lines.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  changes,
  confirmLabel,
  tone = 'danger',
  loading,
  irreversible = true,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: ReactNode
  description?: ReactNode
  changes: ChangeLine[]
  confirmLabel: string
  tone?: 'danger' | 'primary'
  loading?: boolean
  irreversible?: boolean
}) {
  const t = useT()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t('action.cancel')}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtle">
        {t('confirm.changesTitle')}
      </p>
      <ul className="divide-y divide-line rounded-compact border border-line">
        {changes.map((change, index) => (
          <li key={index} className="flex flex-col gap-1 px-3 py-2.5 text-sm">
            <span className="text-xs font-semibold text-text-muted">{change.label}</span>
            {change.from !== undefined || change.to !== undefined ? (
              <span className="flex flex-wrap items-center gap-2">
                {change.from !== undefined ? (
                  <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[13px] text-danger line-through">
                    {change.from}
                  </span>
                ) : null}
                {change.from !== undefined && change.to !== undefined ? (
                  <span aria-hidden="true" className="text-text-subtle">
                    →
                  </span>
                ) : null}
                {change.to !== undefined ? (
                  <span className="rounded bg-mint-soft px-1.5 py-0.5 text-[13px] text-text">
                    {change.to}
                  </span>
                ) : null}
              </span>
            ) : null}
            {change.note ? <span className="text-xs text-text-subtle">{change.note}</span> : null}
          </li>
        ))}
      </ul>
      {irreversible ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-compact bg-amber-soft px-3 py-2 text-xs text-text-muted">
          <span aria-hidden="true">⚠</span>
          {t('confirm.irreversible')}
        </p>
      ) : null}
    </Modal>
  )
}
