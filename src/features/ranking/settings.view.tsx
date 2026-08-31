import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime, formatNumber, formatPercent } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { RoleGate } from '@/app/RequireAuth'
import { Badge } from '@/shared/ui/Badge'
import { TextInput, Toggle } from '@/shared/ui/Field'
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
import type { Experiment, RankingConfig } from '@/shared/api/contracts'
import {
  activateRankingConfig,
  approveRankingConfig,
  createRankingConfig,
  evaluateRankingConfig,
  fetchExperiments,
  fetchFeatureFlags,
  fetchRankingConfigs,
  rollbackRankingConfig,
  setFeatureFlag,
  upsertExperiment,
  type RankingKey,
} from './api'
import { styles } from './settings.style'

type TabId = 'flags' | 'ranking' | 'experiments' | 'health'

const RANKING_KEY: RankingKey = 'suggestion.scoring'

/** Weights are fractions in the engine; the slider moves in the same unit. */
const WEIGHT_STEP = 0.01

/** The variant name the pipeline reserves for "no variant" (`domain/assignment`). */
const CONTROL = 'control'

function WeightSlider({
  weight,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  weight: string
  value: number
  min: number
  max: number
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
        step={WEIGHT_STEP}
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

/** Variant shares as a bar, because four numbers in a row do not read as a split. */
function SplitBar({
  variants,
  controlShare,
}: {
  variants: Record<string, number>
  controlShare: number
}) {
  const { locale } = useI18n()
  const t = useT()
  const segments = [
    ...Object.entries(variants).map(([name, share], index) => ({
      name,
      share,
      tone: index % 2 === 0 ? 'var(--color-lavender)' : 'var(--color-coral)',
    })),
    {
      name: t('settings.experiments.control'),
      share: controlShare,
      tone: 'var(--color-neutral-300)',
    },
  ].filter((segment) => segment.share > 0)

  return (
    <>
      <div className={styles.splitBar} role="presentation">
        {segments.map((segment) => (
          <span
            key={segment.name}
            className={styles.splitSegment}
            style={{ width: `${Math.max(segment.share * 100, 0)}%`, background: segment.tone }}
          />
        ))}
      </div>
      {/* The bar is decoration; these labels carry the numbers. */}
      <p className={styles.splitLegend}>
        {segments.map((segment) => (
          <span key={segment.name}>
            <span
              className={styles.splitDot}
              style={{ background: segment.tone }}
              aria-hidden="true"
            />
            {segment.name}: {formatPercent(segment.share, locale)}
          </span>
        ))}
      </p>
    </>
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

  const navigate = useNavigate()
  const [tab, setTab] = useState<TabId>('flags')
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [pendingActivate, setPendingActivate] = useState<RankingConfig | null>(null)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [evaluating, setEvaluating] = useState<RankingConfig | null>(null)
  const [sampleSize, setSampleSize] = useState(100)
  const [editingExperiment, setEditingExperiment] = useState<string | null>(null)
  const [variantDraft, setVariantDraft] = useState<Record<string, number>>({})
  const [newExperimentKey, setNewExperimentKey] = useState('')

  // Reads are rank-based, so ops_admin and above land here; every write below
  // still asks separately, and the API remains the decision either way.
  const canRead = can('ranking.read')
  const canManageFlags = can('flag.manage')
  const canManageRanking = can('ranking.draft')
  const canManageExperiments = can('experiment.manage')

  const configsQuery = useQuery({
    queryKey: queryKeys.ranking.configs,
    queryFn: ({ signal }) => fetchRankingConfigs({}, signal),
    enabled: canRead,
  })
  const flagsQuery = useQuery({
    queryKey: queryKeys.ranking.flags,
    queryFn: ({ signal }) => fetchFeatureFlags(signal),
    enabled: canRead && tab === 'flags',
  })
  const experimentsQuery = useQuery({
    queryKey: queryKeys.ranking.experiments,
    queryFn: ({ signal }) => fetchExperiments(signal),
    enabled: canRead && tab === 'experiments',
  })
  const kpisQuery = useQuery({
    queryKey: queryKeys.opsKpis,
    queryFn: ({ signal }) => fetchOpsKpis(signal),
    enabled: canRead && tab === 'health',
  })
  const evaluationQuery = useQuery({
    queryKey: queryKeys.ranking.evaluation(evaluating?.id ?? '', sampleSize),
    queryFn: ({ signal }) => evaluateRankingConfig(evaluating?.id ?? '', sampleSize, signal),
    enabled: Boolean(evaluating),
    // The replay is expensive and deterministic for a given sample size.
    staleTime: 600_000,
  })

  const configs = useMemo(
    () => (configsQuery.data ?? []).slice().sort((a, b) => b.version - a.version),
    [configsQuery.data],
  )
  const activeConfig = configs.find((config) => config.status === 'active') ?? null
  /**
   * Bounds ship with each config, so the sliders come from a real version
   * rather than a table the console keeps in parallel. Without any config
   * there is nothing to bound a slider with, and the tab says so.
   */
  const boundsSource = activeConfig ?? configs[0] ?? null
  const boundEntries = Object.entries(boundsSource?.bounds ?? {})

  /** Only an approved or active version is honoured as a variant. */
  const variantCandidates = configs.filter(
    (config) => config.status === 'approved' || config.status === 'active',
  )

  useEffect(() => {
    if (boundsSource) setWeights(boundsSource.weights)
  }, [boundsSource])

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

  const saveExperiment = useMutation({
    mutationFn: ({
      key,
      enabled,
      variants,
    }: {
      key: string
      enabled: boolean
      variants: Record<string, number>
    }) => upsertExperiment(key, { enabled, variants }),
    onSuccess: () => {
      setEditingExperiment(null)
      setNewExperimentKey('')
      toast.success(t('settings.experiments.saved'))
      void queryClient.invalidateQueries({ queryKey: queryKeys.ranking.experiments })
    },
    onError: (error) => toast.error(describeError(error)),
  })

  if (!canRead) {
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
    { id: 'experiments', label: t('settings.tab.experiments') },
    { id: 'health', label: t('settings.tab.health') },
  ]

  const weightsDirty =
    boundsSource != null && JSON.stringify(weights) !== JSON.stringify(boundsSource.weights)

  const draftTotal = Object.values(variantDraft).reduce((sum, share) => sum + share, 0)
  const draftOverAllocated = draftTotal > 1.000001

  const startEditing = (experiment: Experiment) => {
    setEditingExperiment(experiment.key)
    setVariantDraft(experiment.variants)
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('settings.breadcrumb') }]}
        title={t('settings.title')}
        actions={
          // Only a super admin may create staff accounts, so nobody else is
          // offered the door. The API refuses the call either way.
          <RoleGate permission="admin.read" fallback={null}>
            <Button variant="secondary" size="sm" onClick={() => navigate('/settings/accounts')}>
              {t('admins.listTitle')}
            </Button>
          </RoleGate>
        }
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
                    data={flagsQuery.data ?? []}
                    isEmpty={(items) => items.length === 0}
                    onRetry={() => void flagsQuery.refetch()}
                    empty={<EmptyState />}
                  >
                    {(flags) =>
                      flags.map((flag) => (
                        <div key={flag.key} className={styles.flagRow}>
                          <div className="min-w-0">
                            <p className={styles.flagKey}>{flag.key}</p>
                            {flag.description ? (
                              <p className={styles.flagDesc}>{flag.description}</p>
                            ) : null}
                            <p className={styles.flagMeta}>
                              {flag.updatedBy?.displayName ?? flag.updatedBy?.id ?? '—'} ·{' '}
                              {formatDateTime(flag.updatedAt, locale)}
                            </p>
                            {/* Payload is free-form config; shown raw rather than guessed at. */}
                            {flag.payload != null ? (
                              <pre className={styles.flagPayload}>
                                {JSON.stringify(flag.payload, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-[11px] font-semibold text-text-muted">
                              {flag.enabled
                                ? t('settings.flags.enabled')
                                : t('settings.flags.disabled')}
                            </span>
                            <Toggle
                              label={flag.key}
                              checked={flag.enabled}
                              disabled={!canManageFlags || !online}
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
                    data={boundEntries}
                    isEmpty={(items) => items.length === 0}
                    onRetry={() => void configsQuery.refetch()}
                    empty={<EmptyState />}
                  >
                    {(items) => (
                      <>
                        {items.map(([weight, bound]) => (
                          <WeightSlider
                            key={weight}
                            weight={weight}
                            value={weights[weight] ?? bound.min}
                            min={bound.min}
                            max={bound.max}
                            disabled={!canManageRanking || !online}
                            onChange={(next) =>
                              setWeights((current) => ({ ...current, [weight]: next }))
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
                            disabled={!canManageRanking || !online || !activeConfig}
                            onClick={() => setRollbackOpen(true)}
                          >
                            {t('settings.ranking.rollback')}
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!canManageRanking || !online || !weightsDirty}
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

            {tab === 'ranking' && evaluating ? (
              <Card>
                <CardHeader
                  title={t('settings.evaluate.title', { version: evaluating.version })}
                  hint={t('settings.evaluate.hint')}
                  actions={
                    <div className="flex items-end gap-2">
                      <TextInput
                        label={t('settings.evaluate.sampleSize')}
                        inputMode="numeric"
                        value={String(sampleSize)}
                        onChange={(event) => {
                          const next = Number.parseInt(event.target.value, 10)
                          if (Number.isFinite(next)) setSampleSize(Math.min(Math.max(next, 1), 500))
                        }}
                      />
                      <Button size="sm" variant="ghost" onClick={() => setEvaluating(null)}>
                        {t('action.cancel')}
                      </Button>
                    </div>
                  }
                />
                <CardBody>
                  <AsyncBoundary
                    status={evaluationQuery.status}
                    error={evaluationQuery.error}
                    data={evaluationQuery.data}
                    onRetry={() => void evaluationQuery.refetch()}
                  >
                    {(evaluation) => (
                      <>
                        <p className="mb-3 text-xs text-text-muted">
                          {t('settings.evaluate.baseline', {
                            version: evaluation.baselineVersion,
                          })}{' '}
                          ·{' '}
                          {t('settings.evaluate.runs', {
                            n: formatNumber(evaluation.runsEvaluated, locale),
                          })}
                        </p>
                        {evaluation.runsEvaluated === 0 ? (
                          <EmptyState title={t('settings.evaluate.empty')} hint={null} />
                        ) : (
                          <div className={styles.metricGrid}>
                            <div className={styles.metricCard}>
                              <span className={styles.metricLabel}>
                                {t('settings.evaluate.top1')}
                              </span>
                              <span className={styles.metricValue}>
                                {formatPercent(evaluation.metrics.top1Agreement, locale)}
                              </span>
                              <span className={styles.metricHint}>
                                {t('settings.evaluate.top1Hint')}
                              </span>
                            </div>
                            <div className={styles.metricCard}>
                              <span className={styles.metricLabel}>
                                {t('settings.evaluate.top5')}
                              </span>
                              <span className={styles.metricValue}>
                                {formatPercent(evaluation.metrics.top5Overlap, locale)}
                              </span>
                              <span className={styles.metricHint}>
                                {t('settings.evaluate.top5Hint')}
                              </span>
                            </div>
                            <div className={styles.metricCard}>
                              <span className={styles.metricLabel}>
                                {t('settings.evaluate.zero')}
                              </span>
                              <span className={styles.metricValue}>
                                {formatNumber(evaluation.metrics.newZeroResults, locale)}
                              </span>
                              <span className={styles.metricHint}>
                                {t('settings.evaluate.zeroHint')}
                              </span>
                            </div>
                            <div className={styles.metricCard}>
                              <span className={styles.metricLabel}>
                                {t('settings.evaluate.candidates')}
                              </span>
                              <span className={styles.metricValue}>
                                {formatNumber(evaluation.metrics.meanCandidateCount, locale)}
                              </span>
                            </div>
                          </div>
                        )}
                        {/* Skipped runs are named: a silent skip would read as agreement. */}
                        {evaluation.skipped.length > 0 ? (
                          <div className="mt-3">
                            <p className={styles.metricLabel}>
                              {t('settings.evaluate.skipped', {
                                n: formatNumber(evaluation.skipped.length, locale),
                              })}{' '}
                              — {t('settings.evaluate.skippedHint')}
                            </p>
                            <ul className={styles.skippedList}>
                              {evaluation.skipped.map((item) => (
                                <li key={item.runId} className="font-mono">
                                  {item.runId} · {item.reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </>
                    )}
                  </AsyncBoundary>
                </CardBody>
              </Card>
            ) : null}

            {tab === 'experiments' ? (
              <Card>
                <CardHeader
                  title={t('settings.experiments.title')}
                  hint={t('settings.experiments.hint')}
                />
                <CardBody>
                  <AsyncBoundary
                    status={experimentsQuery.status}
                    error={experimentsQuery.error}
                    data={experimentsQuery.data ?? []}
                    isEmpty={(items) => items.length === 0}
                    onRetry={() => void experimentsQuery.refetch()}
                    empty={<EmptyState title={t('settings.experiments.empty')} hint={null} />}
                  >
                    {(experiments) =>
                      experiments.map((experiment) => (
                        <div key={experiment.key} className={styles.experimentRow}>
                          <div className={styles.experimentHead}>
                            <div className="min-w-0">
                              <p className={styles.experimentKey}>{experiment.key}</p>
                              {experiment.description ? (
                                <p className={styles.experimentDesc}>{experiment.description}</p>
                              ) : null}
                              <p className={styles.flagMeta}>
                                {experiment.updatedAt
                                  ? t('settings.experiments.updated', {
                                      time: formatDateTime(experiment.updatedAt, locale),
                                    })
                                  : ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Badge tone={experiment.enabled ? 'mint' : 'neutral'}>
                                {experiment.enabled
                                  ? t('settings.experiments.enabled')
                                  : t('settings.experiments.disabled')}
                              </Badge>
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={!canManageExperiments || !online}
                                onClick={() => startEditing(experiment)}
                              >
                                {t('settings.experiments.edit')}
                              </Button>
                              <Button
                                size="sm"
                                variant={experiment.enabled ? 'danger' : 'secondary'}
                                disabled={!canManageExperiments || !online}
                                title={t('settings.experiments.stopHint')}
                                onClick={() =>
                                  saveExperiment.mutate({
                                    key: experiment.key,
                                    enabled: !experiment.enabled,
                                    variants: experiment.variants,
                                  })
                                }
                              >
                                {experiment.enabled
                                  ? t('settings.experiments.stop')
                                  : t('settings.experiments.start')}
                              </Button>
                            </div>
                          </div>

                          <SplitBar
                            variants={experiment.variants}
                            controlShare={experiment.controlShare}
                          />

                          {editingExperiment === experiment.key ? (
                            <div className="mt-3 flex flex-col gap-2">
                              {variantCandidates.length === 0 ? (
                                <p className={styles.fourEyes}>
                                  <span aria-hidden="true">ℹ</span>
                                  {t('settings.experiments.noApproved')}
                                </p>
                              ) : null}
                              {variantCandidates.map((config) => {
                                const name = String(config.version)
                                const share = variantDraft[name] ?? 0
                                return (
                                  <div key={config.id} className={styles.variantRow}>
                                    <span className="text-[13px] text-text">
                                      v{config.version} ·{' '}
                                      {t(`rankingStatus.${config.status}` as const)}
                                    </span>
                                    <TextInput
                                      label={t('settings.experiments.share')}
                                      inputMode="decimal"
                                      value={String(share)}
                                      onChange={(event) => {
                                        const next = Number.parseFloat(event.target.value)
                                        setVariantDraft((current) => ({
                                          ...current,
                                          [name]: Number.isFinite(next)
                                            ? Math.min(Math.max(next, 0), 1)
                                            : 0,
                                        }))
                                      }}
                                    />
                                    <span className="pb-2 text-[11px] text-text-subtle">
                                      {formatPercent(share, locale)}
                                    </span>
                                  </div>
                                )
                              })}
                              {/* Draft versions are listed so the gap is visible, never selectable. */}
                              {configs
                                .filter((config) => config.status === 'draft')
                                .map((config) => (
                                  <p key={config.id} className="text-[11px] text-text-subtle">
                                    v{config.version} — {t('settings.experiments.draftBlocked')}
                                  </p>
                                ))}
                              <p
                                className={
                                  draftOverAllocated
                                    ? styles.fourEyes
                                    : 'text-[11px] text-text-muted'
                                }
                              >
                                {draftOverAllocated
                                  ? t('settings.experiments.sumError', {
                                      percent: formatPercent(draftTotal, locale),
                                    })
                                  : t('settings.experiments.sumHint', {
                                      percent: formatPercent(1 - draftTotal, locale),
                                    })}
                              </p>
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingExperiment(null)}
                                >
                                  {t('action.cancel')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  // The server refuses over-allocation too; this
                                  // only avoids a round trip that must fail.
                                  disabled={!online || draftOverAllocated}
                                  loading={saveExperiment.isPending}
                                  onClick={() =>
                                    saveExperiment.mutate({
                                      key: experiment.key,
                                      enabled: experiment.enabled,
                                      variants: Object.fromEntries(
                                        Object.entries(variantDraft).filter(
                                          ([name, share]) => share > 0 && name !== CONTROL,
                                        ),
                                      ),
                                    })
                                  }
                                >
                                  {t('action.save')}
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))
                    }
                  </AsyncBoundary>

                  <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
                    <TextInput
                      label={t('settings.experiments.newKey')}
                      hint={t('settings.experiments.newKeyHint')}
                      value={newExperimentKey}
                      disabled={!canManageExperiments}
                      onChange={(event) => setNewExperimentKey(event.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={
                        !canManageExperiments || !online || newExperimentKey.trim().length < 3
                      }
                      loading={saveExperiment.isPending}
                      onClick={() =>
                        saveExperiment.mutate({
                          key: newExperimentKey.trim(),
                          // Created switched off: an experiment that starts
                          // splitting traffic the moment it is named is not a
                          // decision anyone made.
                          enabled: false,
                          variants: {},
                        })
                      }
                    >
                      {t('settings.experiments.create')}
                    </Button>
                  </div>
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
                            {formatNumber(kpis.providerErrorsLast7d, locale)}
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
                          name: config.createdBy.displayName ?? config.createdBy.id,
                          time: formatDateTime(config.createdAt, locale),
                        })}
                      </p>
                      {/* Both names, so four-eyes is checkable here and not taken on trust. */}
                      {config.approvedBy ? (
                        <p className={styles.versionMeta}>
                          {t('settings.ranking.approvedBy', {
                            name: config.approvedBy.displayName ?? config.approvedBy.id,
                          })}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {config.status === 'draft' || config.status === 'approved' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!can('ranking.evaluate') || !online}
                            onClick={() => {
                              setEvaluating(config)
                              setTab('ranking')
                            }}
                          >
                            {t('settings.evaluate.action')}
                          </Button>
                        ) : null}
                        {config.status === 'draft' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            // Four-eyes is enforced server-side (`SELF_APPROVAL`).
                            // The session only carries a display name, so this
                            // is a hint that saves a doomed click — never the
                            // check itself.
                            disabled={
                              !canManageRanking ||
                              !online ||
                              config.createdBy.displayName === session?.displayName
                            }
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
                            disabled={!canManageRanking || !online}
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
        description={
          // Activating an unevaluated version is a change nobody measured; the
          // dialog says so rather than leaving it to be noticed afterwards.
          evaluating?.id === pendingActivate?.id
            ? undefined
            : t('settings.evaluate.notEvaluatedHint')
        }
        tone="primary"
        loading={activate.isPending}
        confirmLabel={t('settings.ranking.activate')}
        changes={
          pendingActivate
            ? [
                ...(activeConfig
                  ? [
                      {
                        label: RANKING_KEY,
                        from: `v${activeConfig.version} (${t('settings.ranking.active')})`,
                        to: `v${activeConfig.version} (${t('rankingStatus.rolled_back')})`,
                      },
                    ]
                  : []),
                ...Object.keys({
                  ...(activeConfig?.weights ?? {}),
                  ...pendingActivate.weights,
                }).map((key) => ({
                  label: key,
                  from: activeConfig?.weights[key]?.toFixed(2) ?? '—',
                  to: pendingActivate.weights[key]?.toFixed(2) ?? '—',
                })),
              ]
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
