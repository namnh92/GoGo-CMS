import type { ReactNode } from 'react'
import { useT } from '@/shared/i18n/i18n'
import { ApiError } from '@/shared/api/errors'
import type { MessageKey } from '@/shared/i18n/vi'
import { Button, Spinner } from './Button'
import { AlertIcon, InboxIcon, OfflineIcon, ShieldOffIcon } from './icons'
import { cn } from './cn'

function Frame({
  icon,
  title,
  hint,
  action,
  tone = 'neutral',
  className,
}: {
  icon: ReactNode
  title: ReactNode
  hint?: ReactNode
  action?: ReactNode
  tone?: 'neutral' | 'danger' | 'amber'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-card border border-dashed px-6 py-12 text-center',
        tone === 'danger'
          ? 'border-danger/35 bg-danger-soft/40'
          : tone === 'amber'
            ? 'border-amber/40 bg-amber-soft/40'
            : 'border-line-strong bg-surface-muted',
        className,
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-pill',
          tone === 'danger'
            ? 'bg-danger-soft text-danger-ink'
            : tone === 'amber'
              ? 'bg-amber-soft text-amber-ink'
              : 'bg-surface-sunken text-text-subtle',
        )}
      >
        {icon}
      </span>
      <p className="font-display text-sm font-bold text-text">{title}</p>
      {hint ? <p className="max-w-md text-xs text-text-muted">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function LoadingState({ label }: { label?: string }) {
  const t = useT()
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 rounded-card border border-line bg-surface px-6 py-12 text-sm text-text-muted"
    >
      <Spinner />
      {label ?? t('state.loading')}
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title?: ReactNode
  hint?: ReactNode
  action?: ReactNode
}) {
  const t = useT()
  return (
    <Frame
      icon={<InboxIcon size={20} />}
      title={title ?? t('state.empty')}
      hint={hint ?? t('state.emptyHint')}
      action={action}
    />
  )
}

export function PermissionDeniedState({ hint }: { hint?: ReactNode }) {
  const t = useT()
  return (
    <Frame
      tone="amber"
      icon={<ShieldOffIcon size={20} />}
      title={t('state.denied')}
      hint={hint ?? t('state.deniedHint')}
    />
  )
}

export function OfflineState() {
  const t = useT()
  return (
    <Frame
      tone="amber"
      icon={<OfflineIcon size={20} />}
      title={t('state.offline')}
      hint={t('state.offlineHint')}
    />
  )
}

/** Maps a stable error code to a translated message, falling back to the API text. */
export function useErrorMessage(): (error: unknown) => string {
  const t = useT()
  return (error: unknown) => {
    if (error instanceof ApiError) {
      const key = `error.${error.code}` as MessageKey
      const translated = t(key)
      return translated === key ? error.message : translated
    }
    return t('error.UNKNOWN')
  }
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT()
  const describe = useErrorMessage()
  const apiError = error instanceof ApiError ? error : null

  if (apiError?.isForbidden) return <PermissionDeniedState />
  if (apiError?.isNetwork) return <OfflineState />

  return (
    <Frame
      tone="danger"
      icon={<AlertIcon size={20} />}
      title={t('state.error')}
      hint={
        <>
          {describe(error)}
          {apiError?.requestId ? (
            <span className="mt-1 block font-mono text-[11px] text-text-subtle">
              {t('state.requestId')}: {apiError.requestId}
            </span>
          ) : null}
        </>
      }
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t('state.retry')}
          </Button>
        ) : null
      }
    />
  )
}

/**
 * The one place a screen decides which of the async states to render.
 * Every list/detail view in the CMS goes through this, so no screen can
 * "forget" the permission-denied or empty branch.
 */
export function AsyncBoundary<T>({
  status,
  error,
  data,
  isEmpty,
  onRetry,
  loading,
  empty,
  children,
}: {
  status: 'pending' | 'error' | 'success'
  error?: unknown
  data?: T
  isEmpty?: (data: T) => boolean
  onRetry?: () => void
  loading?: ReactNode
  empty?: ReactNode
  children: (data: T) => ReactNode
}) {
  if (status === 'pending') return <>{loading ?? <LoadingState />}</>
  if (status === 'error') return <ErrorState error={error} onRetry={onRetry} />
  if (data === undefined) return <>{empty ?? <EmptyState />}</>
  if (isEmpty?.(data)) return <>{empty ?? <EmptyState />}</>
  return <>{children(data)}</>
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded bg-surface-sunken', className)} aria-hidden="true" />
  )
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-live="polite" className="divide-y divide-line">
      <span className="sr-only">loading</span>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }, (_, colIndex) => (
            <Skeleton key={colIndex} className={cn('h-4', colIndex === 0 ? 'w-40' : 'w-24')} />
          ))}
        </div>
      ))}
    </div>
  )
}
