import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { formatNumber, formatPercent, formatRelative } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader, KpiCard } from '@/shared/ui/Card'
import { Badge, StatusBadge, type Tone } from '@/shared/ui/Badge'
import { AsyncBoundary, EmptyState } from '@/shared/ui/State'
import type { OpsKpis } from '@/shared/api/contracts'
import { fetchOpsKpis } from './api'
import { styles } from './dashboard.style'

/** Two-series sparkline. Deliberately dependency-free — it is one chart. */
function TrendChart({ series }: { series: OpsKpis['series'] }) {
  const t = useT()
  if (series.length < 2) return <EmptyState hint={null} />

  const width = 600
  const height = 160
  const toPath = (pick: (point: OpsKpis['series'][number]) => number | null | undefined) => {
    const values = series.map(pick)
    const numeric = values.filter((value): value is number => value != null)
    if (numeric.length < 2) return null
    const max = Math.max(...numeric)
    const min = Math.min(...numeric)
    const span = max - min || 1
    return values
      .map((value, index) => {
        if (value == null) return null
        const x = (index / (series.length - 1)) * width
        const y = height - ((value - min) / span) * (height - 16) - 8
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .filter(Boolean)
      .join(' ')
  }

  const zeroResultPath = toPath((point) => point.zeroResultRate)
  const suggestionPath = toPath((point) => point.suggestionSuccessRate)

  return (
    <>
      <div className={styles.chartFrame}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={t('dashboard.chart.title')}
        >
          <defs>
            <linearGradient id="suggestionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-coral)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--color-coral)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {suggestionPath ? (
            <>
              <path
                d={`${suggestionPath} L ${width} ${height} L 0 ${height} Z`}
                fill="url(#suggestionFill)"
              />
              <path
                d={suggestionPath}
                fill="none"
                stroke="var(--color-coral)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : null}
          {zeroResultPath ? (
            // Dashed so the two series stay distinguishable without colour.
            <path
              d={zeroResultPath}
              fill="none"
              stroke="var(--color-lavender)"
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
          ) : null}
        </svg>
      </div>
      <div className={styles.chartLegend}>
        <span>
          <i
            className={styles.legendSwatch}
            style={{ background: 'var(--color-coral)' }}
            aria-hidden="true"
          />{' '}
          {t('dashboard.chart.suggestion')}
        </span>
        <span>
          <i
            className={styles.legendSwatch}
            style={{ background: 'var(--color-lavender)' }}
            aria-hidden="true"
          />{' '}
          {t('dashboard.chart.zeroResult')} (- - -)
        </span>
      </div>
      <div className={styles.axis}>
        <span>{series[0]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </>
  )
}

const PROVIDER_TONE: Record<string, Tone> = { healthy: 'mint', degraded: 'amber', down: 'danger' }

export default function DashboardScreen() {
  const t = useT()
  const { locale } = useI18n()
  const query = useQuery({
    queryKey: queryKeys.opsKpis,
    queryFn: ({ signal }) => fetchOpsKpis(signal),
    staleTime: 60_000,
  })

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
          {(kpis) => (
            <>
              <div className={styles.kpiGrid}>
                <KpiCard
                  label={t('dashboard.kpi.places')}
                  value={formatNumber(kpis.places.total, locale)}
                  sub={t('dashboard.kpi.placesSub', {
                    published: formatNumber(kpis.places.published, locale),
                    draft: formatNumber(kpis.places.draft, locale),
                    suspended: formatNumber(kpis.places.suspended, locale),
                  })}
                />
                <KpiCard
                  label={t('dashboard.kpi.freshness')}
                  value={formatPercent(kpis.freshnessScore, locale)}
                  sub={t('dashboard.kpi.freshnessSub')}
                  tone={(kpis.freshnessDelta ?? 0) >= 0 ? 'positive' : 'negative'}
                />
                <KpiCard
                  label={t('dashboard.kpi.zeroResult')}
                  value={formatPercent(kpis.zeroResultRate, locale, { digits: 2 })}
                  sub={t('dashboard.kpi.zeroResultSub')}
                  // Falling zero-result is good, so the tone inverts here.
                  tone={(kpis.zeroResultDelta ?? 0) <= 0 ? 'positive' : 'negative'}
                />
                <KpiCard
                  label={t('dashboard.kpi.suggestion')}
                  value={formatPercent(kpis.suggestionSuccessRate, locale)}
                  sub={t('dashboard.kpi.suggestionSub')}
                  tone={(kpis.suggestionSuccessDelta ?? 0) >= 0 ? 'positive' : 'negative'}
                />
              </div>

              <div className={styles.splitGrid}>
                <Card className={styles.wide}>
                  <CardHeader
                    title={t('dashboard.chart.title')}
                    actions={<Badge tone="coral">{t('dashboard.chart.range')}</Badge>}
                  />
                  <CardBody>
                    <TrendChart series={kpis.series} />
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title={t('dashboard.providers.title')} />
                  <CardBody className={styles.stack}>
                    {kpis.providers.length === 0 ? (
                      <EmptyState hint={null} />
                    ) : (
                      kpis.providers.map((provider) => (
                        <div key={provider.name} className={styles.providerRow}>
                          <div className={styles.providerHead}>
                            <span className={styles.providerName}>{provider.name}</span>
                            <StatusBadge
                              tone={PROVIDER_TONE[provider.status] ?? 'neutral'}
                              shape={provider.status === 'healthy' ? 'check' : 'alert'}
                              label={t(`providerStatus.${provider.status}` as const)}
                            />
                          </div>
                          <dl className={styles.providerStats}>
                            <div>
                              <dt className={styles.statLabel}>
                                {t('dashboard.providers.uptime')}
                              </dt>
                              <dd className={styles.statValue}>
                                {formatPercent(provider.uptime, locale, { digits: 2 })}
                              </dd>
                            </div>
                            <div>
                              <dt className={styles.statLabel}>
                                {t('dashboard.providers.latency')}
                              </dt>
                              <dd className={styles.statValue}>
                                {provider.latencyMs != null
                                  ? `${formatNumber(provider.latencyMs, locale)} ms`
                                  : '—'}
                              </dd>
                            </div>
                            <div>
                              <dt className={styles.statLabel}>
                                {t('dashboard.providers.errorRate')}
                              </dt>
                              <dd
                                className={
                                  (provider.errorRate ?? 0) > 0.005
                                    ? styles.statValueBad
                                    : styles.statValue
                                }
                              >
                                {formatPercent(provider.errorRate, locale, { digits: 2 })}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      ))
                    )}
                  </CardBody>
                </Card>
              </div>

              <div className={styles.splitGrid}>
                <Card className={styles.wide}>
                  <CardHeader title={t('dashboard.activity.title')} />
                  <CardBody>
                    {kpis.activity.length === 0 ? (
                      <EmptyState title={t('dashboard.activity.empty')} hint={null} />
                    ) : (
                      <ul>
                        {kpis.activity.map((entry) => (
                          <li key={entry.id} className={styles.activityRow}>
                            <p className={styles.activityText}>
                              <span className={styles.activityActor}>{entry.actor}</span>{' '}
                              <span className={styles.activityAction}>{entry.action}</span>{' '}
                              {entry.resourceHref ? (
                                <Link to={entry.resourceHref} className={styles.activityTarget}>
                                  {entry.resourceLabel}
                                </Link>
                              ) : (
                                <span className={styles.activityTarget}>{entry.resourceLabel}</span>
                              )}
                            </p>
                            <time className={styles.activityTime} dateTime={entry.at}>
                              {formatRelative(entry.at, locale)}
                            </time>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title={t('dashboard.alerts.title')} />
                  <CardBody className={styles.stack}>
                    {kpis.alerts.length === 0 ? (
                      <EmptyState title={t('dashboard.alerts.empty')} hint={null} />
                    ) : (
                      kpis.alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={
                            alert.level === 'critical' ? styles.alertCritical : styles.alertWarning
                          }
                        >
                          <span
                            className={`${styles.alertLabel} ${
                              alert.level === 'critical' ? 'text-danger' : 'text-amber'
                            }`}
                          >
                            {alert.level === 'critical' ? '▲ ' : '⚠ '}
                            {t(
                              alert.level === 'critical'
                                ? 'dashboard.alerts.critical'
                                : 'dashboard.alerts.warning',
                            )}
                          </span>
                          <p className={styles.alertTitle}>{alert.title}</p>
                          {alert.detail ? (
                            <p className={styles.alertDetail}>{alert.detail}</p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </CardBody>
                </Card>
              </div>
            </>
          )}
        </AsyncBoundary>
      </PageBody>
    </>
  )
}
