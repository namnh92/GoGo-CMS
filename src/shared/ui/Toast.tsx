import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useT } from '@/shared/i18n/i18n'
import { IconButton } from './Button'
import { CloseIcon } from './icons'
import { cn } from './cn'

export type ToastTone = 'success' | 'error' | 'info'
type Toast = { id: string; tone: ToastTone; message: string; detail?: string }

type ToastValue = {
  push: (toast: Omit<Toast, 'id'>) => void
  success: (message: string, detail?: string) => void
  error: (message: string, detail?: string) => void
}

const ToastContext = createContext<ToastValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = crypto.randomUUID()
      setToasts((current) => [...current, { ...toast, id }])
      // Errors stay until dismissed; a request id is worth reading twice.
      if (toast.tone !== 'error') {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), 5000),
        )
      }
    },
    [dismiss],
  )

  const value = useMemo<ToastValue>(
    () => ({
      push,
      success: (message, detail) => push({ tone: 'success', message, detail }),
      error: (message, detail) => push({ tone: 'error', message, detail }),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
}) {
  const t = useT()
  return (
    <div
      role="region"
      aria-label="notifications"
      className="pointer-events-none fixed bottom-6 right-6 z-[60] flex w-80 flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-card border px-3 py-2.5 shadow-lg',
            toast.tone === 'success'
              ? 'border-mint/40 bg-mint-soft'
              : toast.tone === 'error'
                ? 'border-danger/40 bg-danger-soft'
                : 'border-line bg-surface',
          )}
        >
          <span aria-hidden="true" className="mt-0.5 text-sm">
            {toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '⚠' : 'ℹ'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-text">{toast.message}</p>
            {toast.detail ? <p className="mt-0.5 text-xs text-text-muted">{toast.detail}</p> : null}
          </div>
          <IconButton
            label={t('action.close')}
            className="h-7 w-7"
            onClick={() => onDismiss(toast.id)}
          >
            <CloseIcon size={13} />
          </IconButton>
        </div>
      ))}
    </div>
  )
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside <ToastProvider>')
  return value
}
