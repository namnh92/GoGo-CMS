import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { formatNumber, formatPercent } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader, KpiCard } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { AsyncBoundary, PermissionDeniedState } from '@/shared/ui/State'
import { useSession } from '@/shared/auth/session'
import { fetchOpsKpis } from './api'
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
                    <CardHeader title={t('dashboard.backlog.title')} />
                    <CardBody>
                      <div className={styles.backlogRow}>
                        <span className={styles.backlogLabel}>
                          {t('dashboard.backlog.reviews')}
                        </span>
                        <span className={styles.backlogValue}>
                          {formatNumber(kpis.moderationBacklog.reviews, locale)}
                        </span>
                      </div>
                      <div className={styles.backlogRow}>
                        <span className={styles.backlogLabel}>
                          {t('dashboard.backlog.reports')}
                        </span>
                        <span className={styles.backlogValue}>
                          {formatNumber(kpis.moderationBacklog.reports, locale)}
                        </span>
                      </div>
                      <div className={styles.cta}>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!can('moderation.read')}
                          onClick={() => navigate('/moderation')}
                        >
                          {t('dashboard.backlog.cta')}
                        </Button>
                      </div>
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
