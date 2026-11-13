import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { useSession } from '@/shared/auth/session'
import { useSessionQueryCleanup } from '@/shared/auth/useSessionQueryCleanup'
import { newIdempotencyKey } from '@/shared/api/client'
import { ApiError, toApiError } from '@/shared/api/errors'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { formatDateTime } from '@/shared/format'
import { AuditTrail } from '@/shared/ui/AuditTrail'
import { Button } from '@/shared/ui/Button'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Select, TextInput } from '@/shared/ui/Field'
import { ConfirmDialog } from '@/shared/ui/Overlay'
import { ErrorState, OfflineState, PermissionDeniedState, Skeleton } from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { useOnline } from '@/shared/ui/useOnline'
import { fetchAudit } from '@/features/audit/api'
import {
  fetchInviteSettings,
  updateInviteSettings,
  type InviteSettings,
  type UpdateInviteSettings,
} from './api'
import {
  displayDuration,
  durationSeconds,
  MAX_TTL_SECONDS,
  UNIT_SECONDS,
  type DurationUnit,
} from './duration'
import { styles } from './inviteSettings.style'

export default function InviteSettingsScreen() {
  const t = useT()
  const { can, currentEpoch } = useSession()
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('nav.group.administration') }]}
        title={t('inviteSettings.title')}
      />
      <PageBody>
        {can('inviteSettings.read') ? (
          <InviteSettingsSession key={currentEpoch()} epoch={currentEpoch()} />
        ) : (
          <PermissionDeniedState />
        )}
      </PageBody>
    </>
  )
}

function InviteSettingsSession({ epoch }: { epoch: number }) {
  const t = useT()
  const { currentEpoch } = useSession()
  const client = useQueryClient()
  const online = useOnline()
  const [denied, setDenied] = useState<ApiError | null>(null)
  const queryKey = ['inviteSettings', epoch] as const
  const query = useQuery({
    queryKey: [...queryKey, 'value'],
    queryFn: ({ signal }) => fetchInviteSettings(signal),
    enabled: !denied,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    retry: false,
  })
  const audit = useInfiniteQuery({
    queryKey: [...queryKey, 'audit'],
    initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) =>
      fetchAudit(
        {
          resourceType: 'room_invite_ttl',
          resourceId: 'global',
          limit: 10,
          cursor: pageParam,
        },
        signal,
        'no-store',
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !denied && !!query.data,
    staleTime: 0,
    retry: false,
  })
  const forbidden =
    denied ??
    ([query.error, audit.error].find((error) => error instanceof ApiError && error.isForbidden) as
      ApiError | undefined)

  useSessionQueryCleanup('inviteSettings', epoch, !!forbidden)
  useEffect(() => {
    if (forbidden) setDenied(forbidden)
  }, [forbidden])

  // Do not let an old session's replies paint the next operator's screen.
  if (epoch !== currentEpoch()) return null
  if (forbidden) return <PermissionDeniedState hint={t('inviteSettings.ssoRequired')} />
  if (!query.data) {
    if (!online) return <OfflineState />
    if (query.error) return <ReadError error={query.error} onRetry={() => void query.refetch()} />
    return (
      <div
        data-testid="invite-settings-loading"
        role="status"
        aria-label={t('state.loading')}
        className={styles.form}
      >
        <Skeleton className={styles.skeletonValue} />
        <Skeleton className={styles.skeleton} />
        <Skeleton className={styles.skeleton} />
      </div>
    )
  }
  return (
    <div className={styles.layout} data-testid="invite-settings-screen">
      <InviteSettingsForm
        data={query.data}
        epoch={epoch}
        refreshing={query.isFetching || !!query.error}
        onDenied={setDenied}
        onSaved={async () => {
          await client.invalidateQueries({ queryKey })
        }}
        onConflict={() => query.refetch()}
      />
      {query.error && <ReadError error={query.error} onRetry={() => void query.refetch()} />}
      <Card>
        <CardHeader title={t('inviteSettings.history')} />
        <CardBody>
          {audit.isPending ? (
            <Skeleton className={styles.skeleton} />
          ) : (
            <>
              {audit.data && (
                <AuditTrail entries={audit.data.pages.flatMap((page) => page.items)} />
              )}
              {audit.error && (
                <ReadError error={audit.error} onRetry={() => void audit.refetch()} />
              )}
              {audit.hasNextPage && (
                <Button
                  variant="secondary"
                  loading={audit.isFetchingNextPage}
                  onClick={() => void audit.fetchNextPage()}
                >
                  {t('audit.loadMore')}
                </Button>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function ReadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT()
  return (
    <div className={styles.form}>
      {error instanceof ApiError && error.status === 503 && (
        <p role="alert">{t('inviteSettings.unavailable')}</p>
      )}
      <ErrorState error={error} onRetry={onRetry} />
      {toApiError(error).isNetwork && (
        <Button variant="secondary" onClick={onRetry}>
          {t('state.retry')}
        </Button>
      )}
    </div>
  )
}

type Intent = { body: UpdateInviteSettings; etag: string; key: string; before: number }

function InviteSettingsForm({
  data,
  epoch,
  refreshing,
  onDenied,
  onSaved,
  onConflict,
}: {
  data: InviteSettings
  epoch: number
  refreshing: boolean
  onDenied: (error: ApiError) => void
  onSaved: () => Promise<void>
  onConflict: () => Promise<unknown>
}) {
  const t = useT()
  const { locale } = useI18n()
  const { can, currentEpoch } = useSession()
  const toast = useToast()
  const online = useOnline()
  const [draft, setDraft] = useState(() => displayDuration(data.ttlSeconds))
  const [intent, setIntent] = useState<Intent | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [conflict, setConflict] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const busy = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
    }
  }, [])
  const seconds = durationSeconds(draft.value, draft.unit)
  const validation =
    seconds === null
      ? t('inviteSettings.validation.positiveInteger')
      : seconds > MAX_TTL_SECONDS
        ? t('inviteSettings.validation.maximum')
        : undefined
  const duration = (value: number) => {
    const display = displayDuration(value)
    return `${display.value} ${t(`inviteSettings.unit.${display.unit}`)}`
  }
  // Once sent, an uncertain outcome can only be retried with the same intent.
  const uncertain =
    !!error &&
    (error.isNetwork ||
      (error.status >= 500 && error.retryable) ||
      error.code === 'IDEMPOTENT_REQUEST_IN_FLIGHT')
  const close = () => {
    if (busy.current) return
    setConfirmOpen(false)
    if (!uncertain) {
      setIntent(null)
      setError(null)
    }
  }
  const save = async () => {
    if (!intent || busy.current || !online || !can('inviteSettings.write')) return
    busy.current = true
    setSaving(true)
    setError(null)
    const abort = new AbortController()
    controller.current = abort
    try {
      await updateInviteSettings(intent.body, intent.etag, intent.key, abort.signal)
      if (!mounted.current || currentEpoch() !== epoch) return
      setIntent(null)
      setConfirmOpen(false)
      setConflict(false)
      toast.success(t('inviteSettings.saved'))
      await onSaved()
    } catch (cause) {
      if (!mounted.current || currentEpoch() !== epoch) return
      const failure = toApiError(cause)
      if (failure.isForbidden) {
        onDenied(failure)
        return
      }
      if (failure.status === 412 || failure.status === 428) {
        setIntent(null)
        setConfirmOpen(false)
        setConflict(true)
        await onConflict()
      } else setError(failure)
    } finally {
      busy.current = false
      if (mounted.current && currentEpoch() === epoch) setSaving(false)
    }
  }
  return (
    <Card>
      <CardHeader title={t('inviteSettings.title')} hint={t('inviteSettings.description')} />
      <CardBody>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            if (
              validation ||
              seconds === null ||
              seconds === data.ttlSeconds ||
              refreshing ||
              !online ||
              intent ||
              !can('inviteSettings.write')
            )
              return
            setError(null)
            setConfirmOpen(true)
            setIntent({
              body: { ttlSeconds: seconds },
              etag: data.etag,
              key: newIdempotencyKey(),
              before: data.ttlSeconds,
            })
          }}
        >
          <dl className={styles.metadata}>
            <div>
              <dt>{t('inviteSettings.current')}</dt>
              <dd className={styles.value} data-testid="invite-settings-current">
                {duration(data.ttlSeconds)}
              </dd>
            </div>
            <div>
              <dt>{t('inviteSettings.updatedBy')}</dt>
              <dd>{data.updatedByAdminId ?? t('inviteSettings.system')}</dd>
            </div>
            <div>
              <dt>{t('inviteSettings.updatedAt')}</dt>
              <dd>
                <time dateTime={data.updatedAt}>{formatDateTime(data.updatedAt, locale)}</time>
              </dd>
            </div>
          </dl>
          {!online && <OfflineState />}
          {conflict && (
            <p role="alert" className={styles.notice}>
              {t('inviteSettings.conflict', { current: duration(data.ttlSeconds) })}
            </p>
          )}
          <div className={styles.fields}>
            <TextInput
              data-testid="invite-settings-duration"
              label={t('inviteSettings.duration')}
              inputMode="numeric"
              value={draft.value}
              error={validation}
              disabled={!!intent || saving}
              onChange={(event) => setDraft({ ...draft, value: event.target.value })}
            />
            <Select
              label={t('inviteSettings.unit')}
              value={draft.unit}
              disabled={!!intent || saving}
              onChange={(event) => setDraft({ ...draft, unit: event.target.value as DurationUnit })}
            >
              {(Object.keys(UNIT_SECONDS) as DurationUnit[]).map((unit) => (
                <option key={unit} value={unit}>
                  {t(`inviteSettings.unit.${unit}`)}
                </option>
              ))}
            </Select>
          </div>
          <p role="status" className={styles.hint}>
            {!validation && seconds !== null
              ? t('inviteSettings.normalizedDuration', { seconds })
              : t('inviteSettings.range')}
          </p>
          <div className={styles.actions}>
            <Button
              variant="primary"
              type="submit"
              disabled={
                !!validation ||
                seconds === data.ttlSeconds ||
                refreshing ||
                !online ||
                !!intent ||
                !can('inviteSettings.write')
              }
            >
              {t('action.save')}
            </Button>
          </div>
        </form>
        {intent && !confirmOpen && (
          <div role="alert" className={styles.notice}>
            <p>{t('inviteSettings.retryIntent')}</p>
            <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
              {t('state.retry')}
            </Button>
          </div>
        )}
        <ConfirmDialog
          open={!!intent && confirmOpen}
          onClose={close}
          onConfirm={() => void save()}
          title={t('inviteSettings.confirm.title')}
          description={t('inviteSettings.confirm.scope')}
          changes={
            intent
              ? [
                  {
                    label: t('inviteSettings.duration'),
                    from: duration(intent.before),
                    to: duration(intent.body.ttlSeconds),
                  },
                ]
              : []
          }
          confirmLabel={error ? t('state.retry') : t('inviteSettings.confirm.save')}
          tone="primary"
          irreversible={false}
          loading={saving}
          confirmDisabled={!online || (uncertain && !error?.retryable)}
        >
          <p>{t('inviteSettings.confirm.codeCap')}</p>
          <p>{t('inviteSettings.confirm.roomExpiry')}</p>
          {error && (
            <div role="alert">
              <p>{error.status === 503 ? t('inviteSettings.unavailable') : error.message}</p>
              {uncertain && <p>{t('inviteSettings.retryIntent')}</p>}
              {error.requestId && (
                <p>
                  {t('state.requestId')}: {error.requestId}
                </p>
              )}
            </div>
          )}
        </ConfirmDialog>
      </CardBody>
    </Card>
  )
}
