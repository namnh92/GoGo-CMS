import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardHeader } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { InlineSelect } from '@/shared/ui/Field'
import { AuditTrail } from '@/shared/ui/AuditTrail'
import {
  AsyncBoundary,
  ErrorState,
  LoadingState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { flagEnvironmentSchema, type FlagEnvironment } from '@/shared/api/contracts'
import { fetchFlagCatalog, fetchFlagOverrides, setFlag } from '@/features/flags/api'
import { resolveOverride } from '@/features/flags/flagValue'
import { FlagConfirmDialog } from '@/features/flags/flagConfirmDialog'
import { fetchAudit } from '@/features/audit/api'
import { ASSISTANT_FLAG_KEY, fetchDocuments } from './api'
import { styles } from './assistant.style'

/**
 * GoGo AI · kill switch (GoGo-CMS#249).
 *
 * Not a new endpoint and not a second store: `assistant.enabled` is a key of
 * the existing feature-flag registry, written through `PUT
 * /cms/feature-flags/{key}` (ops_admin, audited) exactly as App Control and the
 * flags panel write theirs. This screen is a purposed view of that one key,
 * with the effect spelled out before it is flipped in either direction.
 *
 * The key is `platformScoped: false`, so the only scope is the environment.
 */
export default function KillSwitchScreen() {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const canRead = can('flag.read')
  const canManage = can('flag.manage')
  const canReadDocs = can('assistant.read')
  const canAudit = can('audit.read')

  const [environment, setEnvironment] = useState<FlagEnvironment>('all')
  const [confirm, setConfirm] = useState<boolean | null>(null)

  const catalog = useQuery({
    queryKey: queryKeys.flags.catalog,
    queryFn: ({ signal }) => fetchFlagCatalog(signal),
    enabled: canRead,
    staleTime: 60_000,
  })
  const overrides = useQuery({
    queryKey: queryKeys.flags.overrides({ environment, platform: 'all' }),
    queryFn: ({ signal }) => fetchFlagOverrides({ environment, platform: 'all' }, signal),
    enabled: canRead,
  })
  // What turning it on would answer from: the published guide set.
  const publishedDocs = useQuery({
    queryKey: queryKeys.assistant.documents({ status: 'published', limit: 100 }),
    queryFn: ({ signal }) => fetchDocuments({ status: 'published', limit: 100 }, signal),
    enabled: canRead && canReadDocs,
  })
  const audit = useQuery({
    queryKey: queryKeys.assistant.killSwitchAudit,
    queryFn: ({ signal }) =>
      fetchAudit(
        { resourceType: 'feature_flag', resourceId: ASSISTANT_FLAG_KEY, limit: 20 },
        signal,
      ),
    enabled: canRead && canAudit,
  })

  const save = useMutation({
    mutationFn: setFlag,
    onSuccess: (_result, variables) => {
      toast.success(variables.enabled ? t('assistant.kill.savedOn') : t('assistant.kill.savedOff'))
      setConfirm(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.flags.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.assistant.killSwitchAudit })
    },
    onError: (error) => {
      setConfirm(null)
      toast.error(describeError(error))
    },
  })

  const definition = useMemo(
    () => catalog.data?.find((item) => item.key === ASSISTANT_FLAG_KEY),
    [catalog.data],
  )
  const override = resolveOverride(overrides.data ?? [], ASSISTANT_FLAG_KEY, environment, 'all')
  const on = override ? override.enabled : definition?.defaultValue === true
  const envLabel = t(`flags.env.${environment}` as const)

  const header = (
    <PageHeader
      breadcrumb={[{ label: t('app.suffix') }, { label: t('nav.group.assistant') }]}
      title={t('assistant.kill.title')}
    />
  )

  if (!canRead) {
    return (
      <>
        {header}
        <PageBody>
          <PermissionDeniedState hint={t('assistant.kill.deniedHint')} />
        </PageBody>
      </>
    )
  }

  const publishedCount = publishedDocs.data?.items.length
  const publishedLabel =
    publishedCount === undefined
      ? t('assistant.kill.docsUnknown')
      : publishedDocs.data?.nextCursor
        ? t('assistant.kill.docsMany', { count: publishedCount })
        : t('assistant.kill.docs', { count: publishedCount })

  return (
    <>
      {header}
      <PageBody>
        <AsyncBoundary
          status={catalog.status === 'success' ? overrides.status : catalog.status}
          error={catalog.error ?? overrides.error}
          data={catalog.data}
          onRetry={() => {
            void catalog.refetch()
            void overrides.refetch()
          }}
        >
          {() =>
            !definition ? (
              <Card>
                <CardHeader title={t('assistant.kill.title')} />
                <div className={styles.stack}>
                  <p className={styles.warn}>
                    <span aria-hidden="true">ℹ</span>
                    {t('assistant.kill.notRegistered', { key: ASSISTANT_FLAG_KEY })}
                  </p>
                </div>
              </Card>
            ) : (
              <Card>
                <CardHeader title={t('assistant.kill.title')} hint={t('assistant.kill.hint')} />
                <div className={styles.filterBar}>
                  <InlineSelect
                    label={t('flags.environment')}
                    value={environment}
                    onChange={(event) => setEnvironment(event.target.value as FlagEnvironment)}
                  >
                    {flagEnvironmentSchema.options.map((value) => (
                      <option key={value} value={value}>
                        {t(`flags.env.${value}` as const)}
                      </option>
                    ))}
                  </InlineSelect>
                  <Badge tone="neutral">{t('flags.notPlatformScoped')}</Badge>
                </div>
                <div className={styles.stack}>
                  <div className={styles.switchState}>
                    <span className={on ? styles.stateOn : styles.stateOff} role="status">
                      {on ? t('assistant.kill.on') : t('assistant.kill.off')}
                    </span>
                    <span className={styles.stateMeta}>
                      {override
                        ? t('assistant.kill.setBy', {
                            who: override.updatedBy?.displayName ?? override.updatedBy?.id ?? '—',
                            at: formatDateTime(override.updatedAt, locale),
                            scope: t(`flags.env.${override.environment}` as const),
                          })
                        : t('assistant.kill.default')}
                    </span>
                  </div>
                  <p className={styles.note}>
                    <span aria-hidden="true">ℹ</span>
                    {publishedLabel}
                  </p>
                  {canManage ? (
                    <div>
                      <Button
                        variant={on ? 'danger' : 'primary'}
                        disabled={!online}
                        loading={save.isPending}
                        onClick={() => setConfirm(!on)}
                      >
                        {on ? t('assistant.kill.turnOff') : t('assistant.kill.turnOn')}
                      </Button>
                    </div>
                  ) : (
                    <p className={styles.note}>
                      <span aria-hidden="true">ℹ</span>
                      {t('assistant.kill.readOnly')}
                    </p>
                  )}
                  <p className={styles.links}>
                    <Link className={styles.link} to="/app-control">
                      {t('assistant.kill.appControl')}
                    </Link>
                    <Link className={styles.link} to="/settings">
                      {t('assistant.kill.allFlags')}
                    </Link>
                  </p>
                </div>
              </Card>
            )
          }
        </AsyncBoundary>

        <Card>
          <CardHeader title={t('assistant.kill.history')} hint={t('assistant.kill.historyHint')} />
          <div className="p-5">
            {!canAudit ? (
              <PermissionDeniedState />
            ) : audit.status === 'error' ? (
              <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
            ) : audit.data ? (
              <AuditTrail entries={audit.data.items} />
            ) : (
              <LoadingState />
            )}
          </div>
        </Card>
      </PageBody>

      <FlagConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? t('assistant.kill.confirmOnTitle') : t('assistant.kill.confirmOffTitle')}
        description={
          confirm ? t('assistant.kill.confirmOnBody') : t('assistant.kill.confirmOffBody')
        }
        changes={[
          { label: t('flags.environment'), to: envLabel },
          {
            label: ASSISTANT_FLAG_KEY,
            from: on ? t('assistant.kill.on') : t('assistant.kill.off'),
            to: confirm ? t('assistant.kill.on') : t('assistant.kill.off'),
          },
          confirm
            ? {
                label: t('assistant.kill.effect'),
                to: publishedLabel,
                note:
                  publishedCount === 0
                    ? t('assistant.kill.effectOnEmpty')
                    : t('assistant.kill.effectOn'),
              }
            : {
                label: t('assistant.kill.effect'),
                to: t('assistant.kill.effectOffShort'),
                note: t('assistant.kill.effectOff'),
              },
        ]}
        confirmLabel={confirm ? t('assistant.kill.turnOn') : t('assistant.kill.turnOff')}
        tone={confirm ? 'primary' : 'danger'}
        irreversible={false}
        loading={save.isPending}
        online={online}
        onConfirm={(reason) =>
          confirm !== null &&
          save.mutate({
            key: ASSISTANT_FLAG_KEY,
            enabled: confirm,
            ...(environment === 'all' ? {} : { environment }),
            reason,
          })
        }
      >
        <p className={styles.note}>
          <span aria-hidden="true">ℹ</span>
          {t('assistant.kill.auditNote')}
        </p>
      </FlagConfirmDialog>
    </>
  )
}
