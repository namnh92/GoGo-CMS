import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { formatDateTime, formatMoney, formatNumber, formatPercent } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader, KpiCard } from '@/shared/ui/Card'
import { Badge } from '@/shared/ui/Badge'
import { AsyncBoundary, PermissionDeniedState } from '@/shared/ui/State'
import { Sparkline } from '@/shared/ui/Sparkline'
import { cn } from '@/shared/ui/cn'
import { useSession } from '@/shared/auth/session'
import type {
  OpsCostGap,
  OpsCostModel,
  OpsProviderRow,
  OpsProviders,
  OpsSummary,
  OpsWindow,
} from '@/shared/api/contracts'
import { fetchOpsProviders, fetchOpsSummary } from './api'
import { styles } from './monitoring.style'

const WINDOWS: OpsWindow[] = ['1h', '24h', '7d', '30d']

/**
 * BE-CMS-P2 (GoGo-BE#315) — provider monitoring.
 *
 * The console reads `/v1/cms/ops/*` and nothing else. It holds no Grafana
 * credential, no metrics token, and sends no PromQL: the window is one of four
 * values and GoGo-BE owns every query. `/v1/metrics` is a machine surface
 * behind a shared token with no per-user authorization, and a browser is the
 * wrong place for it.
 *
 * The rule that shapes every cell below: **a number nobody measured is not a
 * zero.** `null` renders as "chưa đo", an unavailable backend renders as a
 * banner and blanks rather than zeros, and a truncated window says how many
 * days it actually covers. Grafana is next door for anyone who needs axes.
 */
export default function MonitoringScreen() {
  const t = useT()
  const { can } = useSession()
  const [window, setWindow] = useState<OpsWindow>('24h')

  const allowed = can('ops.dashboard')

  const summary = useQuery({
    queryKey: queryKeys.opsSummary(window),
    queryFn: ({ signal }) => fetchOpsSummary(window, signal),
    // The server caches 45s (short windows) and 3min (wide ones); matching it
    // here means an open console costs the store one query per interval, not
    // one per operator.
    staleTime: 45_000,
    refetchInterval: 60_000,
    enabled: allowed,
  })

  const providers = useQuery({
    queryKey: queryKeys.opsProviders(window),
    queryFn: ({ signal }) => fetchOpsProviders(window, signal),
    staleTime: 45_000,
    refetchInterval: 60_000,
    enabled: allowed,
  })

  if (!allowed) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('monitoring.title')} />
        <PageBody>
          <PermissionDeniedState hint={t('monitoring.denied')} />
        </PageBody>
      </>
    )
  }

  return (
    <>
      <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('monitoring.title')} />
      <PageBody>
        <div className={styles.toolbar}>
          <div className={styles.windowGroup} role="group" aria-label={t('monitoring.window')}>
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={w === window}
                onClick={() => setWindow(w)}
                className={cn(styles.windowButton, w === window && styles.windowButtonActive)}
              >
                {t(`monitoring.window.${w}` as 'monitoring.window.1h')}
              </button>
            ))}
          </div>
          {summary.data ? <BackendBadge data={summary.data} /> : null}
        </div>

        <AsyncBoundary
          status={summary.status}
          error={summary.error}
          data={summary.data}
          onRetry={() => void summary.refetch()}
        >
          {(data) => (
            <>
              <BackendBanner data={data} />
              <Overview data={data} />
              <Trends data={data} />
            </>
          )}
        </AsyncBoundary>

        <Card>
          <CardHeader title={t('monitoring.providers.title')} />
          <CardBody>
            <AsyncBoundary
              status={providers.status}
              error={providers.error}
              data={providers.data}
              onRetry={() => void providers.refetch()}
            >
              {(data) => <ProviderTable data={data} />}
            </AsyncBoundary>
          </CardBody>
        </Card>
      </PageBody>
    </>
  )
}

function BackendBadge({ data }: { data: OpsSummary }) {
  const t = useT()
  if (data.backend.status === 'ok') {
    return <Badge tone="mint">{t('monitoring.backend.ok')}</Badge>
  }
  return (
    <Badge tone={data.backend.status === 'degraded' ? 'amber' : 'danger'}>
      {t(
        data.backend.status === 'degraded'
          ? 'monitoring.backend.degraded'
          : 'monitoring.backend.unavailable',
      )}
    </Badge>
  )
}

/**
 * Three separate statements, never merged into one.
 *
 * "Monitoring is down" is not "GoGo is down"; "these numbers are four minutes
 * old" is not "these numbers are wrong"; and "this window is shorter than you
 * asked for" is not an error at all.
 */
function BackendBanner({ data }: { data: OpsSummary }) {
  const t = useT()
  const { locale } = useI18n()
  return (
    <>
      {data.backend.status === 'unavailable' ? (
        <p className={cn(styles.banner, styles.bannerDown)}>
          {t('monitoring.banner.unavailable')}
          {data.backend.detail ? ` — ${data.backend.detail}` : ''}
        </p>
      ) : null}
      {data.stale ? (
        <p className={cn(styles.banner, styles.bannerWarn)}>
          {t('monitoring.banner.stale', {
            at: data.asOf ? formatDateTime(data.asOf, locale) : '',
          })}
        </p>
      ) : null}
      {data.truncated ? (
        <p className={cn(styles.banner, styles.bannerInfo)}>
          {t('monitoring.banner.truncated', {
            window: data.window,
            effective: data.effectiveWindow,
            days: String(data.retentionDays),
          })}
        </p>
      ) : null}
    </>
  )
}

/** `null` is "chưa đo", and it must never be formatted as a number. */
function Unmeasured() {
  const t = useT()
  return <span className={styles.unmeasured}>{t('monitoring.unmeasured')}</span>
}

function Seconds({ value }: { value: number | null }) {
  if (value === null) return <Unmeasured />
  // Milliseconds read better than "0.175 s" at a glance, and the underlying
  // metric is seconds — the conversion is presentation, not data.
  return <>{`${Math.round(value * 1000)} ms`}</>
}

/**
 * Money, or "chưa đo".
 *
 * `null` means no verified price, or nothing measured to price — both are
 * absences, and neither may render as `$0.00`. A measured zero is a number and
 * renders as one.
 */
function Money({ value, currency }: { value: number | null | undefined; currency: string | null }) {
  const { locale } = useI18n()
  if (value === null || value === undefined || !currency) return <Unmeasured />
  return <>{formatMoney({ amount: value, currency }, locale)}</>
}

function Rate({ value }: { value: number | null }) {
  const { locale } = useI18n()
  if (value === null) return <Unmeasured />
  return <>{formatPercent(value, locale)}</>
}

function Overview({ data }: { data: OpsSummary }) {
  const t = useT()
  const { locale } = useI18n()
  const totals = data.totals

  if (!totals) {
    // Blank cards, not zeroed ones. The banner above already says why.
    return (
      <div className={styles.kpiGrid}>
        {(
          [
            'monitoring.kpi.requests',
            'monitoring.kpi.successRate',
            'monitoring.kpi.p95',
            'monitoring.kpi.units',
          ] as const
        ).map((key) => (
          <KpiCard key={key} label={t(key)} value={<Unmeasured />} />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className={styles.kpiGrid}>
        <KpiCard
          label={t('monitoring.kpi.requests')}
          value={formatNumber(totals.providerRequests, locale)}
          sub={t('monitoring.kpi.requestsSub', {
            window: data.effectiveWindow,
          })}
        />
        <KpiCard
          label={t('monitoring.kpi.successRate')}
          value={<Rate value={totals.providerSuccessRate} />}
          tone={
            totals.providerSuccessRate !== null && totals.providerSuccessRate < 0.9
              ? 'negative'
              : 'positive'
          }
          sub={t('monitoring.kpi.successSub', {
            failures: formatNumber(totals.providerFailures, locale),
            rejected: formatNumber(totals.providerRejected, locale),
          })}
        />
        <KpiCard
          label={t('monitoring.kpi.p95')}
          value={<Seconds value={totals.latency.p95} />}
          sub={t('monitoring.kpi.p95Sub', {
            statuses: data.latencySemantics.excludesHttpStatuses.join(', '),
          })}
        />
        <KpiCard
          label={t('monitoring.kpi.units')}
          value={formatNumber(totals.billableUnits, locale)}
          sub={t('monitoring.kpi.unitsSub')}
        />
      </div>

      <CostOverview costModel={data.costModel} />

      <Card>
        <CardHeader title={t('monitoring.reliability.title')} />
        <CardBody>
          <div className={styles.scroller}>
            <table className={styles.table}>
              <tbody>
                <Row
                  label={t('monitoring.reliability.failures')}
                  hint={t('monitoring.reliability.failuresHint')}
                  value={formatNumber(totals.providerFailures, locale)}
                  rate={<Rate value={totals.providerFailureRate} />}
                />
                <Row
                  label={t('monitoring.reliability.rejected')}
                  hint={t('monitoring.reliability.rejectedHint')}
                  value={formatNumber(totals.providerRejected, locale)}
                  rate={<Rate value={totals.providerRejectedRate} />}
                />
                <Row
                  label={t('monitoring.reliability.p50')}
                  hint={t('monitoring.reliability.latencyHint')}
                  value={<Seconds value={totals.latency.p50} />}
                  rate={<Seconds value={totals.latency.p99} />}
                />
                <Row
                  label={t('monitoring.reliability.rejectedLatency')}
                  hint={t('monitoring.reliability.rejectedLatencyHint')}
                  value={<Seconds value={totals.rejectedLatency.p50} />}
                  rate={<Seconds value={totals.rejectedLatency.p95} />}
                />
              </tbody>
            </table>
          </div>
          <p className={styles.note}>{data.latencySemantics.excludesReason}</p>
        </CardBody>
      </Card>
    </>
  )
}

/**
 * The money, and everything the money leaves out.
 *
 * GoGo-BE#335 gave this screen a price list, and the whole risk of doing that
 * is a plausible-looking total. Three things guard against it, in view rather
 * than in a comment:
 *
 * - the amount is labelled as a list-price estimate with no free tier removed,
 *   and carries the price-list version it came from;
 * - when an operation in view has no verified price, the figure is announced
 *   as a floor and the operation is named;
 * - the two kinds of gap — nothing counted, and nothing priced — get their own
 *   panel with their own words, because they are fixed by different people.
 */
function CostOverview({ costModel }: { costModel: OpsCostModel }) {
  const t = useT()
  const partial = costModel.costComplete === false && costModel.unpricedOperations.length > 0
  return (
    <>
      <div className={styles.kpiGrid}>
        <KpiCard
          label={t('monitoring.kpi.cost')}
          value={<Money value={costModel.estimatedCost} currency={costModel.currency} />}
          tone={partial ? 'negative' : 'neutral'}
          sub={
            partial
              ? t('monitoring.kpi.costPartial', {
                  operations: costModel.unpricedOperations.join(', '),
                })
              : t('monitoring.kpi.costSub', { version: costModel.pricingVersion ?? '—' })
          }
        />
      </div>
      <p className={styles.note}>
        <span aria-hidden="true">ℹ</span>
        {t('monitoring.cost.estimateOnly')} {costModel.note}
      </p>
      <CostGaps gaps={costModel.measurementGaps} />
    </>
  )
}

function CostGaps({ gaps }: { gaps: OpsCostGap[] }) {
  const t = useT()
  if (gaps.length === 0) return null
  return (
    <Card>
      <CardHeader title={t('monitoring.cost.gapsTitle')} />
      <CardBody>
        <div className={styles.gapList}>
          {gaps.map((gap) => (
            <div key={`${gap.kind}:${gap.key}`} className={styles.gapRow}>
              {/* Colour alone never carries this: the badge says which kind. */}
              <Badge tone={gap.kind === 'not_instrumented' ? 'neutral' : 'amber'}>
                {t(`monitoring.cost.gap.${gap.kind}` as 'monitoring.cost.gap.not_instrumented')}
              </Badge>
              <span className={styles.gapKey}>{gap.key}</span>
              <span className={styles.gapDetail}>{gap.detail}</span>
            </div>
          ))}
        </div>
        <p className={styles.note}>{t('monitoring.cost.gapsNote')}</p>
      </CardBody>
    </Card>
  )
}

function Row({
  label,
  hint,
  value,
  rate,
}: {
  label: string
  hint: string
  value: React.ReactNode
  rate: React.ReactNode
}) {
  return (
    <tr>
      <td className={styles.td}>
        <span className={styles.provider}>{label}</span>
        <p className="text-[11px] text-text-subtle">{hint}</p>
      </td>
      <td className={styles.tdNum}>{value}</td>
      <td className={styles.tdNum}>{rate}</td>
    </tr>
  )
}

function Trends({ data }: { data: OpsSummary }) {
  const t = useT()
  if (!data.trends) return null
  const s = data.trends.series
  const cards = [
    { key: 'requests', points: s.requests, tone: 'coral' as const },
    { key: 'failures', points: s.failures, tone: 'danger' as const },
    { key: 'latencyP95', points: s.latencyP95, tone: 'lavender' as const },
    { key: 'costUnits', points: s.costUnits, tone: 'amber' as const },
  ]
  return (
    <Card>
      <CardHeader title={t('monitoring.trends.title')} />
      <CardBody>
        <div className={styles.trendGrid}>
          {cards.map((c) => (
            <div key={c.key} className={styles.trendCard}>
              <p className={styles.trendLabel}>
                {t(`monitoring.trends.${c.key}` as 'monitoring.trends.requests')}
              </p>
              <Sparkline
                points={c.points}
                tone={c.tone === 'danger' ? 'amber' : c.tone}
                label={
                  c.points.length < 2
                    ? t('monitoring.trends.tooFewPoints')
                    : t('monitoring.trends.ariaLabel', {
                        metric: t(`monitoring.trends.${c.key}` as 'monitoring.trends.requests'),
                        window: data.effectiveWindow,
                      })
                }
              />
            </div>
          ))}
        </div>
        <p className={styles.note}>{t('monitoring.trends.note')}</p>
      </CardBody>
    </Card>
  )
}

function ProviderTable({ data }: { data: OpsProviders }) {
  const t = useT()
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>{t('monitoring.providers.provider')}</th>
            <th className={styles.thNum}>{t('monitoring.providers.calls')}</th>
            <th className={styles.thNum}>{t('monitoring.providers.successRate')}</th>
            <th className={styles.thNum}>{t('monitoring.providers.failures')}</th>
            <th className={styles.thNum}>{t('monitoring.providers.rejected')}</th>
            <th className={styles.thNum}>{t('monitoring.providers.p50')}</th>
            <th className={styles.thNum}>{t('monitoring.providers.p95')}</th>
            <th className={styles.thNum}>{t('monitoring.providers.units')}</th>
            <th className={styles.thNum}>{t('monitoring.providers.cost')}</th>
          </tr>
        </thead>
        <tbody>
          {data.providers.map((p) => (
            <ProviderRow key={p.provider} row={p} currency={data.costModel.currency} />
          ))}
        </tbody>
      </table>
      <p className={styles.note}>{data.costModel.note}</p>
    </div>
  )
}

function ProviderRow({ row, currency }: { row: OpsProviderRow; currency: string | null }) {
  const t = useT()
  const { locale } = useI18n()
  const name = t(`monitoring.provider.${row.provider}` as 'monitoring.provider.places')

  if (!row.instrumented) {
    return (
      <tr>
        <td className={styles.td}>
          <span className={styles.provider}>{name}</span>
        </td>
        {/*
          One cell across the row, not eight zeros. "chưa đo" and "0 lượt gọi"
          are different claims, and printing the second where the first is true
          is how a dashboard becomes the last place to learn something.
        */}
        <td className={styles.td} colSpan={8}>
          <Badge tone="neutral">{t('monitoring.providers.notInstrumented')}</Badge>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td className={styles.td}>
        <span className={styles.provider}>{name}</span>
      </td>
      <td className={styles.tdNum}>{formatNumber(row.calls, locale)}</td>
      <td className={styles.tdNum}>
        <Rate value={row.successRate} />
      </td>
      <td className={styles.tdNum}>{formatNumber(row.failures, locale)}</td>
      <td className={styles.tdNum}>{formatNumber(row.rejected, locale)}</td>
      <td className={styles.tdNum}>
        <Seconds value={row.latency.p50} />
      </td>
      <td className={styles.tdNum}>
        <Seconds value={row.latency.p95} />
      </td>
      <td className={styles.tdNum}>
        {row.billableUnits === null ? <Unmeasured /> : formatNumber(row.billableUnits, locale)}
      </td>
      <td className={styles.tdNum}>
        {/*
          Routes measures its units exactly and has no verified per-element
          list price, so this cell is "chưa đo" beside a real call count. That
          combination is the point: the units are a fact and the money is not.
        */}
        <Money value={row.estimatedCost} currency={currency} />
      </td>
    </tr>
  )
}
