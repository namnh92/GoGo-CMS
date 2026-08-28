import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatNumber, formatPercent } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { InlineSelect } from '@/shared/ui/Field'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import { fetchSearchAnalytics } from '@/features/ops/api'
import { styles } from './searchQuality.style'

const WINDOWS = [7, 14, 30, 90] as const
type Window = (typeof WINDOWS)[number]

/**
 * CMS-015 — search quality.
 *
 * Everything here comes from a daily aggregate, so there is no drill-down to
 * an individual search and the screen never implies one: a daily counter
 * carries no actor, which is exactly why it can be read at all.
 */
export default function SearchQualityScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { can } = useSession()
  const [days, setDays] = useState<Window>(7)

  const canRead = can('searchAnalytics.read')

  const query = useQuery({
    queryKey: queryKeys.searchAnalytics(days),
    queryFn: ({ signal }) => fetchSearchAnalytics(days, 20, signal),
    enabled: canRead,
  })

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('searchQuality.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('searchQuality.breadcrumb') }]}
        title={t('searchQuality.title')}
        showSearch={false}
        actions={
          <InlineSelect
            label={t('searchQuality.window')}
            value={String(days)}
            onChange={(event) => setDays(Number.parseInt(event.target.value, 10) as Window)}
          >
            {WINDOWS.map((option) => (
              <option key={option} value={option}>
                {t(`searchQuality.window.${option}` as const)}
              </option>
            ))}
          </InlineSelect>
        }
      />
      <PageBody>
        <p className={`${styles.note} mb-5`}>
          <span aria-hidden="true">ℹ</span>
          {t('searchQuality.subtitle')} {t('searchQuality.noDrilldown')}
        </p>

        <AsyncBoundary
          status={query.status}
          error={query.error}
          data={query.data}
          onRetry={() => void query.refetch()}
        >
          {(analytics) =>
            analytics.totals.searches === 0 ? (
              <EmptyState title={t('searchQuality.empty')} hint={null} />
            ) : (
              <>
                <div className={styles.kpiGrid}>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>{t('searchQuality.zeroRate')}</span>
                    <span className={styles.kpiValue}>
                      {formatPercent(analytics.totals.zeroResultRate, locale)}
                    </span>
                    {/* The rate never appears without the denominator behind it. */}
                    <span className={styles.kpiWindow}>
                      {formatNumber(analytics.totals.zeroResults, locale)} /{' '}
                      {formatNumber(analytics.totals.searches, locale)} ·{' '}
                      {t('searchQuality.window.note', { days: analytics.days })}
                    </span>
                  </div>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>{t('searchQuality.searches')}</span>
                    <span className={styles.kpiValue}>
                      {formatNumber(analytics.totals.searches, locale)}
                    </span>
                    <span className={styles.kpiWindow}>
                      {t('searchQuality.window.note', { days: analytics.days })}
                    </span>
                  </div>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>{t('searchQuality.avgResults')}</span>
                    <span className={styles.kpiValue}>
                      {formatNumber(analytics.totals.avgResults, locale)}
                    </span>
                    <span className={styles.kpiWindow}>
                      {t('searchQuality.window.note', { days: analytics.days })}
                    </span>
                  </div>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>{t('searchQuality.latency')}</span>
                    <span className={styles.kpiValue}>
                      {formatNumber(analytics.totals.avgLatencyMs, locale)} ms
                    </span>
                    <span className={styles.kpiWindow}>
                      {t('searchQuality.window.note', { days: analytics.days })}
                    </span>
                  </div>
                </div>

                <Card className="mt-5">
                  <CardHeader
                    title={t('searchQuality.trend')}
                    hint={t('searchQuality.trendTable')}
                  />
                  <CardBody>
                    {/*
                      A bar per day, but the number is written next to it: the
                      bar is decoration and the row must read without colour.
                    */}
                    <table className="w-full">
                      <caption className="sr-only">{t('searchQuality.trendTable')}</caption>
                      <thead className="sr-only">
                        <tr>
                          <th scope="col">{t('searchQuality.col.day')}</th>
                          <th scope="col">{t('searchQuality.col.rate')}</th>
                          <th scope="col">{t('searchQuality.col.zero')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.trend.map((point) => (
                          <tr key={point.day} className={styles.trendRow}>
                            <th scope="row" className={styles.trendDay}>
                              {point.day}
                            </th>
                            <td className="flex-1">
                              <span className={styles.trendBar}>
                                <span
                                  className={styles.trendFill}
                                  style={{
                                    width: `${Math.min(point.zeroResultRate * 100, 100)}%`,
                                  }}
                                />
                              </span>
                            </td>
                            <td className={styles.trendValue}>
                              {formatPercent(point.zeroResultRate, locale)} ·{' '}
                              {formatNumber(point.zeroResults, locale)}/
                              {formatNumber(point.searches, locale)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardBody>
                </Card>

                <Card className="mt-5">
                  <CardHeader title={t('searchQuality.worst')} />
                  <CardBody>
                    {analytics.worstQueries.length === 0 ? (
                      <EmptyState hint={null} />
                    ) : (
                      <ul>
                        {analytics.worstQueries.map((row) => (
                          <li key={row.query} className={styles.queryRow}>
                            <span className={styles.queryText}>{row.query}</span>
                            <span className={styles.queryMeta}>
                              {formatPercent(row.zeroResultRate, locale)} ·{' '}
                              {formatNumber(row.zeroResults, locale)}/
                              {formatNumber(row.searches, locale)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {/*
                      Rare terms are counted but not named. Dropping them would
                      report a lower failure rate than the real one.
                    */}
                    {analytics.hiddenBelowFloor.terms > 0 ? (
                      <div className={`${styles.hidden} mt-3`}>
                        <p className="font-semibold">
                          {t('searchQuality.hidden')}:{' '}
                          {t('searchQuality.hiddenValue', {
                            terms: formatNumber(analytics.hiddenBelowFloor.terms, locale),
                            searches: formatNumber(analytics.hiddenBelowFloor.searches, locale),
                            zero: formatNumber(analytics.hiddenBelowFloor.zeroResults, locale),
                          })}
                        </p>
                        <p className="mt-1">{t('searchQuality.hiddenHint')}</p>
                      </div>
                    ) : null}
                  </CardBody>
                </Card>
              </>
            )
          }
        </AsyncBoundary>
      </PageBody>
    </>
  )
}
