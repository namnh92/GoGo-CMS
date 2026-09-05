import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { formatDateTime, formatNumber, formatPercent } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader, KpiCard } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { AsyncBoundary, PermissionDeniedState } from '@/shared/ui/State'
import { useSession } from '@/shared/auth/session'
import { fetchModerationCounts } from '@/features/moderation/api'
import { fetchImportJobs } from '@/features/imports/api'
import { JobStatusBadge } from '@/features/imports/status'
import {
  fetchCostOverview,
  fetchOpsHealth,
  fetchOpsKpis,
  fetchOpsQueues,
  fetchSearchAnalytics,
} from './api'
import { BasisBadge, CostAmount, FreshnessBadge, ProviderStatusBadge } from './costParts'
import { styles } from './dashboard.style'

/**
 * `GET /cms/ops/kpis` returns six aggregates over fixed windows and nothing
 * else — no time series, no per-provider health, no activity feed. So this
 * screen shows counts with the window named, and does not draw a trend line
 * it has no data for.
 */
export default function DashboardScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const { can } = useSession()

  const query = useQuery({
    queryKey: queryKeys.opsKpis,
    queryFn: ({ signal }) => fetchOpsKpis(signal),
    staleTime: 60_000,
    enabled: can('ops.dashboard'),
  })

  /*
   * The satellite cards each stand on their own endpoint and their own
   * permission. A failed satellite never takes the KPI row down with it —
   * each card renders its own error state instead.
   */
  const counts = useQuery({
    queryKey: queryKeys.moderation.counts,
    queryFn: ({ signal }) => fetchModerationCounts(signal),
    staleTime: 60_000,
    enabled: can('moderation.read'),
  })
  const jobs = useQuery({
    queryKey: queryKeys.imports.list(0, 5),
    queryFn: ({ signal }) => fetchImportJobs(0, 5, signal),
    staleTime: 60_000,
    enabled: can('import.read'),
  })
  const search = useQuery({
    queryKey: queryKeys.searchAnalytics(7),
    queryFn: ({ signal }) => fetchSearchAnalytics(7, 5, signal),
    staleTime: 60_000,
    enabled: can('searchAnalytics.read'),
  })
  // BE-CMS-G8: cached ~20s server-side, refetched at the same cadence here —
  // a screen, not an alerting path.
  const health = useQuery({
    queryKey: queryKeys.opsHealth,
    queryFn: ({ signal }) => fetchOpsHealth(signal),
    refetchInterval: 30_000,
    enabled: can('ops.dashboard'),
  })
  const opsQueues = useQuery({
    queryKey: queryKeys.opsQueues,
    queryFn: ({ signal }) => fetchOpsQueues(signal),
    refetchInterval: 30_000,
    enabled: can('ops.dashboard'),
  })
  // COST-CMS-011 (#111): the card summarises the registry-keyed Cost Center —
  // `providerRows`, month to date — one line per provider, never a Google
  // service dressed as one. The legacy #335 `providers[]` half of the same
  // payload is read nowhere in the CMS any more.
  const costs = useQuery({
    queryKey: queryKeys.opsCostCenter('mtd'),
    queryFn: ({ signal }) => fetchCostOverview('mtd', signal),
    staleTime: 5 * 60_000,
    enabled: can('ops.dashboard'),
  })

  /**
   * The four real queues. Reviews have their own screen; the other three live
   * as tabs whose state is local to /moderation, so all three link there — a
   * `?tab=` param nothing reads would be a dead control.
   */
  const queues = [
    { key: 'reviews', to: '/moderation/reviews', value: counts.data?.reviews },
    { key: 'reports', to: '/moderation', value: counts.data?.reports },
    { key: 'checkins', to: '/moderation', value: counts.data?.checkins },
    { key: 'community', to: '/moderation', value: counts.data?.communityPlaces },
  ] as const

  if (!can('ops.dashboard')) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('dashboard.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('dashboard.breadcrumb') }]}
        title={t('dashboard.title')}
      />
      <PageBody>
        <AsyncBoundary
          status={query.status}
          error={query.error}
          data={query.data}
          onRetry={() => void query.refetch()}
        >
          {(kpis) => {
            const { fresh, stale, unknown } = kpis.placeFreshness
            const published = fresh + stale + unknown
            const freshRatio = published > 0 ? fresh / published : null
            const runs = kpis.suggestionRunsLast7d.succeeded + kpis.suggestionRunsLast7d.failed
            const successRatio = runs > 0 ? kpis.suggestionRunsLast7d.succeeded / runs : null
            const backlog = kpis.moderationBacklog.reviews + kpis.moderationBacklog.reports

            return (
              <>
                <div className={styles.kpiGrid}>
                  <KpiCard
                    label={t('dashboard.freshness.score')}
                    value={formatPercent(freshRatio, locale)}
                    sub={t('dashboard.freshness.hint')}
                    tone={freshRatio != null && freshRatio >= 0.9 ? 'positive' : 'negative'}
                  />
                  <KpiCard
                    label={t('dashboard.suggestion.rate')}
                    value={formatPercent(successRatio, locale)}
                    sub={t('dashboard.suggestion.hint', {
                      succeeded: formatNumber(kpis.suggestionRunsLast7d.succeeded, locale),
                      failed: formatNumber(kpis.suggestionRunsLast7d.failed, locale),
                    })}
                    tone={successRatio != null && successRatio >= 0.85 ? 'positive' : 'negative'}
                  />
                  {/*
                    The count alone has no denominator; the search-quality
                    console has the rate it belongs to, so this card points there
                    instead of standing on its own.
                  */}
                  <button
                    type="button"
                    className="text-left"
                    disabled={!can('searchAnalytics.read')}
                    onClick={() => navigate('/search-quality')}
                  >
                    <KpiCard
                      label={t('dashboard.zeroResult.title')}
                      value={formatNumber(kpis.zeroResultsLast7d, locale)}
                      sub={`${t('dashboard.window7d')} · ${t('searchQuality.open')}`}
                    />
                  </button>
                  <KpiCard
                    label={t('dashboard.budget.title')}
                    value={formatNumber(kpis.currentPlansOverBudget, locale)}
                    sub={`${t('dashboard.windowNow')} · ${t('dashboard.budget.hint')}`}
                    tone={kpis.currentPlansOverBudget > 0 ? 'negative' : 'neutral'}
                  />
                  <KpiCard
                    label={t('dashboard.provider.title')}
                    value={formatNumber(kpis.providerErrorsLast7d, locale)}
                    sub={`${t('dashboard.window7d')} · ${t('dashboard.provider.hint')}`}
                    tone={kpis.providerErrorsLast7d > 0 ? 'negative' : 'neutral'}
                  />
                  <KpiCard
                    label={t('dashboard.backlog.title')}
                    value={formatNumber(backlog, locale)}
                    sub={`${t('dashboard.windowNow')} · ${t('dashboard.backlog.reviews')} ${formatNumber(
                      kpis.moderationBacklog.reviews,
                      locale,
                    )} · ${t('dashboard.backlog.reports')} ${formatNumber(kpis.moderationBacklog.reports, locale)}`}
                    tone={backlog > 0 ? 'negative' : 'positive'}
                  />
                </div>

                <div className={styles.splitGrid}>
                  <Card>
                    <CardHeader
                      title={t('dashboard.freshness.title')}
                      hint={t('dashboard.freshness.hint')}
                    />
                    <CardBody className={styles.breakdown}>
                      {/* Proportions, with the numbers spelled out beside them:
                          a stacked bar alone is not a readable figure. */}
                      <div
                        className={styles.barTrack}
                        role="img"
                        aria-label={`${t('dashboard.freshness.fresh')} ${fresh}, ${t('dashboard.freshness.stale')} ${stale}, ${t('dashboard.freshness.unknown')} ${unknown}`}
                      >
                        <span
                          style={{
                            width: `${published > 0 ? (fresh / published) * 100 : 0}%`,
                            background: 'var(--color-mint)',
                          }}
                        />
                        <span
                          style={{
                            width: `${published > 0 ? (stale / published) * 100 : 0}%`,
                            background: 'var(--color-amber)',
                          }}
                        />
                        <span
                          style={{
                            width: `${published > 0 ? (unknown / published) * 100 : 0}%`,
                            background: 'var(--color-neutral-300)',
                          }}
                        />
                      </div>
                      <div className={styles.legend}>
                        <span className={styles.legendItem}>
                          <i
                            className={styles.legendSwatch}
                            style={{ background: 'var(--color-mint)' }}
                            aria-hidden="true"
                          />
                          {t('dashboard.freshness.fresh')}{' '}
                          <b className={styles.legendValue}>{formatNumber(fresh, locale)}</b>
                        </span>
                        <span className={styles.legendItem}>
                          <i
                            className={styles.legendSwatch}
                            style={{ background: 'var(--color-amber)' }}
                            aria-hidden="true"
                          />
                          {t('dashboard.freshness.stale')}{' '}
                          <b className={styles.legendValue}>{formatNumber(stale, locale)}</b>
                        </span>
                        <span className={styles.legendItem}>
                          <i
                            className={styles.legendSwatch}
                            style={{ background: 'var(--color-neutral-300)' }}
                            aria-hidden="true"
                          />
                          {t('dashboard.freshness.unknown')}{' '}
                          <b className={styles.legendValue}>{formatNumber(unknown, locale)}</b>
                        </span>
                      </div>
                      <div className={styles.cta}>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!can('place.read')}
                          onClick={() => navigate('/places')}
                        >
                          {t('dashboard.freshness.cta')}
                        </Button>
                      </div>
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader
                      title={t('dashboard.queues.title')}
                      hint={t('dashboard.queues.hint')}
                    />
                    <CardBody>
                      {can('moderation.read') ? (
                        counts.isError ? (
                          <p className={styles.note}>{t('dashboard.satelliteError')}</p>
                        ) : (
                          queues.map((queue) => (
                            <button
                              key={queue.key}
                              type="button"
                              className={styles.queueRow}
                              onClick={() => navigate(queue.to)}
                            >
                              <span className={styles.queueLabel}>
                                {t(`dashboard.queues.${queue.key}` as const)}
                              </span>
                              <span
                                className={
                                  (queue.value ?? 0) > 0 ? styles.queueValue : styles.queueZero
                                }
                              >
                                {queue.value === undefined
                                  ? '…'
                                  : formatNumber(queue.value, locale)}
                              </span>
                            </button>
                          ))
                        )
                      ) : (
                        <p className={styles.note}>{t('dashboard.queues.noPermission')}</p>
                      )}
                    </CardBody>
                  </Card>
                </div>

                <div className={styles.splitGrid}>
                  <Card>
                    <CardHeader
                      title={t('dashboard.imports.title')}
                      hint={t('dashboard.imports.hint')}
                    />
                    <CardBody>
                      {can('import.read') ? (
                        jobs.isError ? (
                          <p className={styles.note}>{t('dashboard.satelliteError')}</p>
                        ) : (jobs.data?.items.length ?? 0) === 0 ? (
                          <p className={styles.note}>{t('dashboard.imports.empty')}</p>
                        ) : (
                          jobs.data?.items.map((job) => (
                            <div key={job.id} className={styles.jobRow}>
                              <div className="min-w-0">
                                <p className={styles.jobName}>
                                  {job.sourceFileName ??
                                    t(`importSource.${job.sourceType}` as const)}
                                </p>
                                <p className={styles.jobMeta}>
                                  {job.createdAt ? formatDateTime(job.createdAt, locale) : '—'}
                                </p>
                              </div>
                              <JobStatusBadge status={job.status} />
                              <span className={styles.jobTotals}>
                                {formatNumber(job.totals.success, locale)}/
                                {formatNumber(job.totals.rows, locale)}
                              </span>
                            </div>
                          ))
                        )
                      ) : (
                        <p className={styles.note}>{t('dashboard.queues.noPermission')}</p>
                      )}
                      <div className={styles.cta}>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!can('import.read')}
                          onClick={() => navigate('/imports')}
                        >
                          {t('dashboard.imports.cta')}
                        </Button>
                      </div>
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader
                      title={t('dashboard.searchTrend.title')}
                      hint={t('dashboard.searchTrend.hint')}
                    />
                    <CardBody>
                      {can('searchAnalytics.read') ? (
                        search.isError ? (
                          <p className={styles.note}>{t('dashboard.satelliteError')}</p>
                        ) : (
                          <>
                            {/* Bar per day, number written beside it — same
                                discipline as the search-quality console. */}
                            {(search.data?.trend ?? []).map((point) => (
                              <div key={point.day} className={styles.trendRow}>
                                <span className={styles.trendDay}>{point.day}</span>
                                <span className={styles.trendBar}>
                                  <span
                                    className={styles.trendFill}
                                    style={{
                                      width: `${Math.min(point.zeroResultRate * 100, 100)}%`,
                                    }}
                                  />
                                </span>
                                <span className={styles.trendValue}>
                                  {formatPercent(point.zeroResultRate, locale)} ·{' '}
                                  {formatNumber(point.zeroResults, locale)}/
                                  {formatNumber(point.searches, locale)}
                                </span>
                              </div>
                            ))}
                            <div className={styles.cta}>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => navigate('/search-quality')}
                              >
                                {t('searchQuality.open')}
                              </Button>
                            </div>
                          </>
                        )
                      ) : (
                        <p className={styles.note}>{t('dashboard.queues.noPermission')}</p>
                      )}
                    </CardBody>
                  </Card>
                </div>

                {/* BE-CMS-G8 shipped: the sections below read the real
                    endpoints. `unknown` renders as unknown — it is not a
                    synonym for healthy — and "no cost source" is a different
                    claim from "zero spend". */}
                <h2 className={styles.sectionTitle}>{t('dashboard.observability.title')}</h2>
                <div className={styles.splitGrid}>
                  <Card>
                    <CardHeader
                      title={t('dashboard.monitoring.title')}
                      hint={t('dashboard.health.hint')}
                    />
                    <CardBody>
                      {health.isError ? (
                        <p className={styles.note}>{t('dashboard.satelliteError')}</p>
                      ) : (health.data?.services.length ?? 0) === 0 ? (
                        <p className={styles.note}>{t('dashboard.health.empty')}</p>
                      ) : (
                        health.data?.services.map((service) => (
                          <div key={service.key} className={styles.healthRow}>
                            <span className={styles.healthKey}>{service.key}</span>
                            <span
                              className={`${styles.healthStatus} ${
                                service.status === 'healthy'
                                  ? styles.healthHealthy
                                  : service.status === 'degraded'
                                    ? styles.healthDegraded
                                    : service.status === 'down'
                                      ? styles.healthDown
                                      : styles.healthUnknown
                              }`}
                            >
                              <span className={styles.healthDot} aria-hidden="true" />
                              {t(`dashboard.health.${service.status}` as const)}
                            </span>
                            <span className={styles.healthLatency}>
                              {service.latencyMs != null
                                ? `${formatNumber(service.latencyMs, locale)}ms`
                                : ''}
                            </span>
                            <span className={styles.healthDetail} title={service.detail ?? ''}>
                              {service.detail ?? ''}
                            </span>
                          </div>
                        ))
                      )}
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader
                      title={t('dashboard.queuesOps.title')}
                      hint={t('dashboard.queuesOps.hint')}
                    />
                    <CardBody>
                      {opsQueues.isError ? (
                        <p className={styles.note}>{t('dashboard.satelliteError')}</p>
                      ) : (opsQueues.data?.queues.length ?? 0) === 0 ? (
                        // An unreachable broker contributes no rows; health is
                        // where that outage is reported.
                        <p className={styles.note}>{t('dashboard.queuesOps.empty')}</p>
                      ) : (
                        <div className={styles.queueTableWrap}>
                          <table className={styles.queueTable}>
                            <caption className="sr-only">{t('dashboard.queuesOps.title')}</caption>
                            <thead>
                              <tr className={styles.queueHead}>
                                <th scope="col" className={styles.queueHeadCell}>
                                  {t('dashboard.queuesOps.col.name')}
                                </th>
                                <th scope="col" className={`${styles.queueHeadCell} text-right`}>
                                  {t('dashboard.queuesOps.col.pending')}
                                </th>
                                <th scope="col" className={`${styles.queueHeadCell} text-right`}>
                                  {t('dashboard.queuesOps.col.running')}
                                </th>
                                <th scope="col" className={`${styles.queueHeadCell} text-right`}>
                                  {t('dashboard.queuesOps.col.failed')}
                                </th>
                                <th scope="col" className={`${styles.queueHeadCell} text-right`}>
                                  {t('dashboard.queuesOps.col.dead')}
                                </th>
                                <th scope="col" className={`${styles.queueHeadCell} text-right`}>
                                  {t('dashboard.queuesOps.col.oldest')}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {opsQueues.data?.queues.map((queue) => (
                                <tr key={queue.name} className={styles.queueRowLine}>
                                  <td className={styles.queueCellName}>
                                    {queue.name}
                                    {queue.source === 'database' ? (
                                      <span className="ml-1.5 align-middle">
                                        <Badge tone="lavender">
                                          {t('dashboard.queuesOps.outbox')}
                                        </Badge>
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className={styles.queueCell}>
                                    {formatNumber(queue.pending, locale)}
                                  </td>
                                  <td className={styles.queueCellMuted}>
                                    {formatNumber(queue.running, locale)}
                                  </td>
                                  <td
                                    className={
                                      queue.failed24h > 0
                                        ? styles.queueCellBad
                                        : styles.queueCellMuted
                                    }
                                  >
                                    {/* A truncated scan is a floor, and says so. */}
                                    {queue.failed24hTruncated ? '≥' : ''}
                                    {formatNumber(queue.failed24h, locale)}
                                  </td>
                                  <td
                                    className={
                                      queue.deadLetter > 0
                                        ? styles.queueCellBad
                                        : styles.queueCellMuted
                                    }
                                  >
                                    {formatNumber(queue.deadLetter, locale)}
                                  </td>
                                  <td className={styles.queueCellMuted}>
                                    {queue.oldestPendingSeconds != null
                                      ? t('dashboard.queuesOps.age', {
                                          minutes: formatNumber(
                                            Math.round(queue.oldestPendingSeconds / 60),
                                            locale,
                                          ),
                                        })
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </div>

                <div className={styles.splitGrid}>
                  <Card>
                    <CardHeader
                      title={t('dashboard.costs.title')}
                      hint={t('dashboard.costs.hint')}
                    />
                    <CardBody>
                      {costs.isError ? (
                        <p className={styles.note}>{t('dashboard.satelliteError')}</p>
                      ) : costs.data ? (
                        <>
                          {costs.data.providerRows.map((provider) => (
                            <div key={provider.providerId} className={styles.costRow}>
                              <span className={styles.costKey}>{provider.displayName}</span>
                              <span className={styles.costBasis}>
                                <ProviderStatusBadge status={provider.status} />
                              </span>
                              <span className={styles.costQuota}>
                                {/* Where the number comes from and how fresh
                                    the source is — both facts. A row with no
                                    source shows no basis it does not have. */}
                                {provider.costStatus === 'UNKNOWN' ? null : (
                                  <BasisBadge basis={provider.basis} />
                                )}{' '}
                                <FreshnessBadge status={provider.freshness.status} />
                              </span>
                              <CostAmount
                                className={styles.costValue}
                                spendMicros={provider.spendMicros}
                                currency={provider.currency}
                                mixedCurrency={provider.mixedCurrency}
                                costStatus={provider.costStatus}
                              />
                            </div>
                          ))}
                          <p className={styles.note}>
                            {t('dashboard.costs.footer', {
                              month: costs.data.month,
                              at: formatDateTime(costs.data.generatedAt, locale),
                              providers: formatNumber(
                                costs.data.cards.unknown.providerIds.length,
                                locale,
                              ),
                            })}{' '}
                            <Link to="/costs">{t('dashboard.costs.open')}</Link>
                          </p>
                        </>
                      ) : null}
                    </CardBody>
                  </Card>
                </div>

                <p className={styles.note}>
                  <span aria-hidden="true">ℹ</span>
                  {t('dashboard.contractNote')}
                </p>
              </>
            )
          }}
        </AsyncBoundary>
      </PageBody>
    </>
  )
}
