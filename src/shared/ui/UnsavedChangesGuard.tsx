import { useContext, useEffect, type ReactNode } from 'react'
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom'
import { useT } from '@/shared/i18n/i18n'
import { Button } from './Button'
import { Modal } from './Overlay'

/** Browser-level guard: reload, tab close, typing another address. */
function useBeforeUnload(when: boolean): void {
  useEffect(() => {
    if (!when) return
    const handler = (event: BeforeUnloadEvent) => {
      // The wording belongs to the browser; only the cancellation is ours.
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [when])
}

export type UnsavedChangesGuardProps = {
  when: boolean
  /** What is unsaved, one line per block. A bare "are you sure?" is not enough. */
  pending: string[]
}

/**
 * The prompt itself, so the router guard and a screen's own "cancel" control
 * ask the same question with the same words instead of two look-alikes.
 */
export function UnsavedChangesDialog({
  open,
  pending,
  onStay,
  onLeave,
}: {
  open: boolean
  pending: string[]
  onStay: () => void
  onLeave: () => void
}) {
  const t = useT()
  return (
    <Modal
      open={open}
      onClose={onStay}
      title={t('unsaved.title')}
      description={t('unsaved.description')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onStay}>
            {t('unsaved.stay')}
          </Button>
          <Button variant="danger" onClick={onLeave}>
            {t('unsaved.leave')}
          </Button>
        </div>
      }
    >
      <UnsavedList pending={pending} />
    </Modal>
  )
}

/**
 * Stops a page with pending edits from being left by accident, in both ways a
 * person leaves one: the browser (`beforeunload`) and in-app navigation.
 *
 * `useBlocker` only exists inside a data router. The app mounts one
 * (`createBrowserRouter`); a test rendering a single screen under
 * `MemoryRouter` does not, and calling the hook there throws. So the hook is
 * reached through a child that is only mounted when the context is present —
 * the browser guard, which needs no router at all, always runs.
 */
export function UnsavedChangesGuard({ when, pending }: UnsavedChangesGuardProps) {
  useBeforeUnload(when)
  const dataRouter = useContext(UNSAFE_DataRouterContext)
  if (!dataRouter) return null
  return <RouterUnsavedPrompt when={when} pending={pending} />
}

function RouterUnsavedPrompt({ when, pending }: UnsavedChangesGuardProps) {
  const blocker = useBlocker(when)
  return (
    <UnsavedChangesDialog
      open={blocker.state === 'blocked'}
      pending={pending}
      onStay={() => blocker.reset?.()}
      onLeave={() => blocker.proceed?.()}
    />
  )
}

function UnsavedList({ pending }: { pending: string[] }): ReactNode {
  const t = useT()
  if (pending.length === 0) return null
  return (
    <>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtle">
        {t('unsaved.pending')}
      </p>
      <ul className="divide-y divide-line rounded-compact border border-line">
        {pending.map((item) => (
          <li key={item} className="px-3 py-2.5 text-sm text-text">
            {item}
          </li>
        ))}
      </ul>
    </>
  )
}
