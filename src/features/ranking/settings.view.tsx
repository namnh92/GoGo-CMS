import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime, formatPercent } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { Toggle } from '@/shared/ui/Field'
import { Tabs, type TabItem } from '@/shared/ui/Tabs'
import { ConfirmDialog } from '@/shared/ui/Overlay'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { fetchOpsKpis } from '@/features/ops/api'
import type { RankingConfig } from '@/shared/api/contracts'
import {
  activateRankingConfig,
  approveRankingConfig,
  createRankingConfig,
  fetchFeatureFlags,
  fetchRankingConfigs,
  rollbackRankingConfig,
  setFeatureFlag,
  type RankingKey,
} from './api'
import { styles } from './settings.style'

type TabId = 'flags' | 'ranking' | 'health'

const RANKING_KEY: RankingKey = 'suggestion.scoring'

function WeightSlider({
  weight,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  weight: string
  value: number
  min: number
  max: number
  step: number
  disabled: boolean
  onChange: (next: number) => void
}) {
  const percent = ((value - min) / (max - min || 1)) * 100
  return (
    <div className={styles.weightRow}>
      <div className={styles.weightHead}>
        <label htmlFor={`weight-${weight}`} className={styles.weightLabel}>
          {weight}
        </label>
        <span className={styles.weightValue}>{value.toFixed(2)}</span>
      </div>
      <input
        id={`weight-${weight}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number.parseFloat(event.target.value))}
        className={styles.slider}
        style={{
          background: `linear-gradient(to right, var(--color-coral) ${percent}%, var(--color-surface-sunken) ${percent}%)`,
        }}
      />
      <div className={styles.bounds}>
        <span>{min.toFixed(2)}</span>
        <span>{max.toFixed(2)}</span>
      </div>
    </div>
  )
}

export default function SettingsScreen() {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can, session } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const [tab, setTab] = useState<TabId>('flags')
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [pendingActivate, setPendingActivate] = useState<RankingConfig | null>(null)
  const [rollbackOpen, setRollbackOpen] = useState(false)

  const canManageFlags = can('flag.manage')

  const configsQuery = useQuery({
    queryKey: queryKeys.ranking.configs,
    queryFn: ({ signal }) => fetchRankingConfigs(signal),
    enabled: canManageFlags,
  })
  const flagsQuery = useQuery({
    queryKey: queryKeys.ranking.flags,
    queryFn: ({ signal }) => fetchFeatureFlags(signal),
    enabled: canManageFlags,
  })
  const kpisQuery = useQuery({
    queryKey: queryKeys.opsKpis,
    queryFn: ({ signal }) => fetchOpsKpis(signal),
    enabled: canManageFlags && tab === 'health',
  })

  const configs = useMemo(
    () => (configsQuery.data?.items ?? []).slice().sort((a, b) => b.version - a.version),
    [configsQuery.data],
  )
  const bounds = configsQuery.data?.bounds ?? []
  const activeConfig = configs.find((config) => config.status === 'active') ?? null

  useEffect(() => {
    if (activeConfig) setWeights(activeConfig.weights)
  }, [activeConfig])

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.ranking.configs })

  const draft = useMutation({
    mutationFn: () => createRankingConfig(RANKING_KEY, weights),
    onSuccess: () => {
      toast.success(t('settings.ranking.draft'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const approve = useMutation({
    mutationFn: (id: string) => approveRankingConfig(id),
    onSuccess: () => {
      toast.success(t('settings.ranking.approve'))
      invalidate()
    },
    onError: (error) => {
      const message = describeError(error)
      toast.error(message, t('settings.ranking.selfApproval'))
    },
  })

  const activate = useMutation({
    mutationFn: (id: string) => activateRankingConfig(id),
    onSuccess: () => {
      setPendingActivate(null)
      toast.success(t('settings.ranking.activate'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const rollback = useMutation({
    mutationFn: () => rollbackRankingConfig(RANKING_KEY),
    onSuccess: () => {
      setRollbackOpen(false)
      toast.success(t('settings.ranking.rollback'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const toggleFlag = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      setFeatureFlag(key, enabled),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.ranking.flags }),
    onError: (error) => toast.error(describeError(error)),
  })

  if (!canManageFlags) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('settings.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const tabs: TabItem<TabId>[] = [
    { id: 'flags', label: t('settings.tab.flags') },
    { id: 'ranking', label: t('settings.tab.ranking') },
    { id: 'health', label: t('settings.tab.health') },
  ]

  const weightsDirty =
    activeConfig != null && JSON.stringify(weights) !== JSON.stringify(activeConfig.weights)

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('settings.breadcrumb') }]}
        title={t('settings.title')}
      />
      <PageBody>
        <Tabs items={tabs} value={tab} onChange={setTab} label={t('settings.breadcrumb')} />

        <div className={styles.layout}>
          <div className={styles.main}>
            {tab === 'flags' ? (
              <Card>
                <CardHeader title={t('settings.flags.title')} hint={t('settings.flags.hint')} />
                <CardBody>
                  <AsyncBoundary
                    status={flagsQuery.status}
                    error={flagsQuery.error}
                    data={flagsQuery.data?.items ?? []}
                    isEmpty={(items) => items.length === 0}
                    onRetry={() => void flagsQuery.refetch()}
                    empty={<EmptyState />}
                  >
                    {(flags) =>
                      flags.map((flag) => (
                        <div key={flag.key} className={styles.flagRow}>
                          <div className="min-w-0">
                            <p className={styles.flagKey}>
                              {flag.key}
                              {flag.isKillSwitch ? (
                                <Badge tone="danger" className="ml-2">
                                  kill switch
                                </Badge>
                              ) : null}
                            </p>
                            {flag.description ? (
                              <p className={styles.flagDesc}>{flag.description}</p>
                            ) : null}
                            <p className={styles.flagMeta}>
                              {flag.updatedBy ?? '—'} · {formatDateTime(flag.updatedAt, locale)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {flag.rolloutPercent != null ? (
                              <Badge tone="neutral">
                                {formatPercent(flag.rolloutPercent, locale, {
                                  alreadyPercent: true,
                                  digits: 0,
                                })}
                              </Badge>
                            ) : null}
                            <span className="text-[11px] font-semibold text-text-muted">
                              {flag.enabled
                                ? t('settings.flags.enabled')
                                : t('settings.flags.disabled')}
                            </span>
                            <Toggle
                              label={flag.key}
                              checked={flag.enabled}
                              disabled={!online}
                              onChange={(enabled) => toggleFlag.mutate({ key: flag.key, enabled })}
                            />
                          </div>
                        </div>
                      ))
                    }
                  </AsyncBoundary>
                </CardBody>
              </Card>
            ) : null}

            {tab === 'ranking' ? (
              <Card>
                <CardHeader
                  title={t('settings.ranking.title')}
                  hint={t('settings.ranking.hint')}
                  actions={
                    activeConfig ? (
                      <Badge tone="coral">
                        v{activeConfig.version} · {t('settings.ranking.active')}
                      </Badge>
                    ) : null
                  }
                />
                <CardBody>
                  <AsyncBoundary
                    status={configsQuery.status}
                    error={configsQuery.error}
                    data={bounds}
                    isEmpty={(items) => items.length === 0}
                    onRetry={() => void configsQuery.refetch()}
                    empty={<EmptyState />}
                  >
                    {(items) => (
                      <>
                        {items.map((bound) => (
                          <WeightSlider
                            key={bound.weight}
                            weight={bound.weight}
                            value={weights[bound.weight] ?? bound.min}
                            min={bound.min}
                            max={bound.max}
                            step={bound.step}
                            disabled={!online}
                            onChange={(next) =>
                              setWeights((current) => ({ ...current, [bound.weight]: next }))
                            }
                          />
                        ))}
                        <p className={`${styles.fourEyes} mt-4`}>
                          <span aria-hidden="true">ℹ</span>
                          {t('settings.ranking.selfApproval')}
                        </p>
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={!online || !activeConfig}
                            onClick={() => setRollbackOpen(true)}
                          >
                            {t('settings.ranking.rollback')}
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!online || !weightsDirty}
                            loading={draft.isPending}
                            onClick={() => draft.mutate()}
                          >
                            {t('settings.ranking.draft')}
                          </Button>
                        </div>
                      </>
                    )}
                  </AsyncBoundary>
                </CardBody>
              </Card>
            ) : null}

            {tab === 'health' ? (
              <Card>
                <CardHeader title={t('settings.health.title')} hint={t('settings.health.hint')} />
                <CardBody className="flex flex-col gap-3">
                  <AsyncBoundary
                    status={kpisQuery.status}
                    error={kpisQuery.error}
                    data={kpisQuery.data}
                    onRetry={() => void kpisQuery.refetch()}
                  >
                    {(kpis) => (
                      <>
                        {/* There is no per-provider health endpoint. The only
                            provider signal the contract exposes is this count,
                            so the tab reports it plainly instead of drawing a
                            status board out of nothing. */}
                        <div className={styles.providerCard}>
                          <div className={styles.providerHead}>
                            <span className="text-[13px] font-semibold text-text">
                              {t('dashboard.provider.title')}
                            </span>
                            <Badge tone={kpis.providerErrorsLast7d > 0 ? 'amber' : 'mint'}>
                              {t('dashboard.window7d')}
                            </Badge>
                          </div>
                          <p className="font-display text-2xl font-extrabold tabular-nums text-text">
                            {formatPercent(null, locale) === '—'
                              ? kpis.providerErrorsLast7d
                              : kpis.providerErrorsLast7d}
                          </p>
                          <p className="mt-1 text-xs text-text-muted">
                            {t('dashboard.provider.hint')}
                          </p>
                        </div>
                        <p className={styles.fourEyes}>
                          <span aria-hidden="true">ℹ</span>
                          {t('settings.health.contractNote')}
                        </p>
                      </>
                    )}
                  </AsyncBoundary>
                </CardBody>
              </Card>
            ) : null}
          </div>

          <div className={styles.side}>
            <Card>
              <CardHeader title={t('settings.ranking.history')} />
              <CardBody className="flex flex-col gap-2">
                {configs.length === 0 ? (
                  <EmptyState hint={null} />
                ) : (
                  configs.map((config) => (
                    <div
                      key={config.id}
                      className={`${styles.version} ${
                        config.status === 'active' ? styles.versionActive : styles.versionIdle
                      }`}
                    >
                      <div className={styles.versionHead}>
                        <span className={styles.versionLabel}>v{config.version}</span>
                        <Badge tone={config.status === 'active' ? 'coral' : 'neutral'}>
                          {t(`rankingStatus.${config.status}` as const)}
                        </Badge>
                      </div>
                      <p className={styles.versionMeta}>
                        {t('settings.ranking.createdBy', {
                          name: config.createdBy ?? '—',
                          time: formatDateTime(config.createdAt, locale),
                        })}
                      </p>
                      {config.approvedBy ? (
                        <p className={styles.versionMeta}>
                          {t('settings.ranking.approvedBy', { name: config.approvedBy })}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {config.status === 'draft' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            // Four-eyes is enforced server-side; the UI only
                            // avoids offering the creator a pointless click.
                            disabled={!online || config.createdBy === session?.displayName}
                            loading={approve.isPending && approve.variables === config.id}
                            onClick={() => approve.mutate(config.id)}
                          >
                            {t('settings.ranking.approve')}
                          </Button>
                        ) : null}
                        {config.status === 'approved' ? (
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!online}
                            onClick={() => setPendingActivate(config)}
                          >
                            {t('settings.ranking.activate')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      </PageBody>

      <ConfirmDialog
        open={pendingActivate !== null}
        onClose={() => setPendingActivate(null)}
        onConfirm={() => pendingActivate && activate.mutate(pendingActivate.id)}
        title={t('settings.ranking.previewTitle')}
        tone="primary"
        loading={activate.isPending}
        confirmLabel={t('settings.ranking.activate')}
        changes={
          pendingActivate
            ? Object.keys({ ...(activeConfig?.weights ?? {}), ...pendingActivate.weights }).map(
                (key) => ({
                  label: key,
                  from: activeConfig?.weights[key]?.toFixed(2) ?? '—',
                  to: pendingActivate.weights[key]?.toFixed(2) ?? '—',
                }),
              )
            : []
        }
      />

      <ConfirmDialog
        open={rollbackOpen}
        onClose={() => setRollbackOpen(false)}
        onConfirm={() => rollback.mutate()}
        title={t('settings.ranking.rollback')}
        description={t('settings.ranking.rollbackHint')}
        loading={rollback.isPending}
        confirmLabel={t('settings.ranking.rollback')}
        changes={
          activeConfig
            ? [
                {
                  label: RANKING_KEY,
                  from: `v${activeConfig.version} (${t('settings.ranking.active')})`,
                  to: t('settings.ranking.rollbackHint'),
                },
              ]
            : []
        }
      />
    </>
  )
}
