import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useI18n, useLabel, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatDateTime, formatNumber } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader, KpiCard } from '@/shared/ui/Card'
import { StatusBadge, type Tone } from '@/shared/ui/Badge'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import { AlertIcon, InfoIcon } from '@/shared/ui/icons'
import type { CmsCostTestRunDetail } from '@/shared/api/contracts'
import { fetchCostTestRun } from './api'
import { formatMicros } from './costMoney'
import { BasisBadge, ConfidenceBadge } from './costParts'
import { styles } from './costTestRun.style'

/**
 * The run's currency, or null when its deltas do not agree. The server sums
 * `estimatedCostMicros` across whatever it priced; a sum over two currencies
 * is not an amount, so the page shows the dash rather than a number with a
 * borrowed symbol (CLAUDE.md rule 13 — an amount never leaves its unit behind).
 */
function runCurrency(deltas: CmsCostTestRunDetail['deltas']): string | null {
  const currencies = new Set(deltas.map((delta) => delta.currency))
  return currencies.size === 1 ? [...currencies][0]! : null
}

const RUN_TONE: Record<string, Tone> = {
  running: 'lavender',
  ok: 'mint',
  over_budget: 'amber',
  failed: 'danger',
}

/**
 * COST-CMS-009 (GoGo-BE#378/#381) — what one test run cost.
 *
 * The screen's job is to keep two absences apart. A run still `running` has
 * measured nothing yet: its deltas are the baseline snapshot at 0 and both
 * totals are null, so a "0" here would read as "this run was free". A
 * finished run may still have no price for some meter — those are named in
 * `unpriced`, and the total is then a floor, which the page says out loud
 * rather than presenting as a sum.
 */
export default function CostTestRunScreen() {
  const t = useT()
  const label = useLabel()
  const { locale } = useI18n()
  const { can } = useSession()
  const { id = '' } = useParams<{ id: string }>()

  const allowed = can('cost.read')

  const run = useQuery({
    queryKey: queryKeys.opsCostTestRun(id),
    queryFn: ({ signal }) => fetchCostTestRun(id, signal),
    enabled: allowed && id.length > 0,
  })

  const breadcrumb = [
    { label: t('app.suffix') },
    { label: t('cost.title'), to: '/costs' },
    { label: t('costRun.breadcrumb') },
  ]

  if (!allowed) {
    return (
      <>
        <PageHeader breadcrumb={breadcrumb} title={t('costRun.title')} />
        <PageBody>
          <PermissionDeniedState hint={t('cost.denied')} />
        </PageBody>
      </>
    )
  }

  return (
    <>
      <PageHeader breadcrumb={breadcrumb} title={run.data?.name ?? t('costRun.title')} />
      <PageBody>
        <AsyncBoundary
          status={run.status}
          error={run.error}
          data={run.data}
          onRetry={() => void run.refetch()}
        >
          {(data) => {
            const currency = runCurrency(data.deltas)
            const mixedCurrency = currency == null && data.deltas.length > 0
            return (
              <>
                <div className={styles.totals}>
                  <KpiCard
                    label={t('costRun.estimated')}
                    value={formatMicros(data.estimatedCostMicros, currency, locale)}
                    sub={
                      mixedCurrency
                        ? t('costRun.mixedCurrency')
                        : data.status === 'running'
                          ? t('costRun.openRun')
                          : data.estimatedCostMicros == null
                            ? t('costRun.noPrice')
                            : data.unpriced.length > 0
                              ? t('costRun.floor', { count: data.unpriced.length })
                              : t('costRun.estimatedSub')
                    }
                    tone={data.unpriced.length > 0 || mixedCurrency ? 'negative' : 'neutral'}
                  />
                  <KpiCard
                    label={t('costRun.actual')}
                    value={formatMicros(data.actualCostMicros, currency, locale)}
                    sub={t('costRun.actualSub')}
                  />
                </div>

                {data.unpriced.length > 0 ? (
                  <div className={styles.noteWarn}>
                    <AlertIcon size={14} />
                    <span>
                      {t('costRun.unpriced', { count: data.unpriced.length })}
                      <span className={styles.idList}>
                        {data.unpriced.map((meter) => (
                          <span key={meter} className={styles.idChip}>
                            {meter}
                          </span>
                        ))}
                      </span>
                    </span>
                  </div>
                ) : null}

                <Card>
                  <CardHeader
                    title={
                      <span className={styles.head}>
                        <span>{data.name}</span>
                        <StatusBadge
                          tone={RUN_TONE[data.status] ?? 'neutral'}
                          shape={
                            data.status === 'ok'
                              ? 'check'
                              : data.status === 'running'
                                ? 'clock'
                                : 'alert'
                          }
                          label={label(`cost.runStatus.${data.status}`, data.status)}
                        />
                      </span>
                    }
                    hint={t('costRun.hint')}
                  />
                  <CardBody>
                    <Facts run={data} />
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title={t('costRun.deltas')} hint={t('costRun.deltasHint')} />
                  <CardBody className="p-0">
                    {data.deltas.length === 0 ? (
                      <EmptyState title={t('costRun.noDeltas')} hint={t('costRun.noDeltasHint')} />
                    ) : (
                      <div className={styles.scroller}>
                        <table className={styles.table}>
                          <caption className="sr-only">{t('costRun.deltas')}</caption>
                          <thead>
                            <tr>
                              <th className={styles.th}>{t('costRun.col.service')}</th>
                              <th className={styles.th}>{t('costRun.col.meter')}</th>
                              <th className={styles.thNum}>{t('costRun.col.before')}</th>
                              <th className={styles.thNum}>{t('costRun.col.after')}</th>
                              <th className={styles.thNum}>{t('costRun.col.delta')}</th>
                              <th className={styles.thNum}>{t('costRun.col.estimated')}</th>
                              <th className={styles.thNum}>{t('costRun.col.actual')}</th>
                              <th className={styles.th}>{t('cost.col.basis')}</th>
                              <th className={styles.th}>{t('cost.col.confidence')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.deltas.map((delta) => (
                              <tr
                                key={`${delta.serviceId}:${delta.operationId ?? ''}:${delta.usageMetricId}`}
                              >
                                <td className={styles.td}>
                                  <span className={`block ${styles.service}`}>
                                    {delta.serviceId}
                                  </span>
                                  <span className={`block ${styles.mono}`}>
                                    {delta.operationId ?? '—'}
                                  </span>
                                </td>
                                <td className={styles.td}>
                                  <span className={`block ${styles.mono}`}>
                                    {delta.usageMetricId}
                                  </span>
                                  <span className={styles.muted}>{delta.unit}</span>
                                </td>
                                <td className={styles.tdNum}>
                                  {formatNumber(delta.usageBefore, locale)}
                                </td>
                                <td className={styles.tdNum}>
                                  {formatNumber(delta.usageAfter, locale)}
                                </td>
                                <td className={styles.tdNum}>
                                  {formatNumber(delta.usageDelta, locale)}
                                </td>
                                <td className={styles.tdNum}>
                                  {delta.estimatedCostDelta == null ? (
                                    <span className={styles.unknownCell}>
                                      {t('costRun.priceUnknown')}
                                    </span>
                                  ) : (
                                    formatMicros(delta.estimatedCostDelta, delta.currency, locale)
                                  )}
                                </td>
                                <td className={styles.tdNum}>
                                  {delta.actualCostDelta == null ? (
                                    <span className={styles.unknownCell}>—</span>
                                  ) : (
                                    formatMicros(delta.actualCostDelta, delta.currency, locale)
                                  )}
                                </td>
                                <td className={styles.td}>
                                  <BasisBadge basis={delta.basis} />
                                </td>
                                <td className={styles.td}>
                                  <ConfidenceBadge confidence={delta.confidence} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardBody>
                </Card>
              </>
            )
          }}
        </AsyncBoundary>
      </PageBody>
    </>
  )
}

function Facts({ run }: { run: CmsCostTestRunDetail }) {
  const t = useT()
  const { locale } = useI18n()

  const rows: { label: string; value: string }[] = [
    { label: t('costRun.fact.environment'), value: run.environment },
    { label: t('costRun.fact.started'), value: formatDateTime(run.startedAt, locale) },
    {
      label: t('costRun.fact.ended'),
      value: run.endedAt ? formatDateTime(run.endedAt, locale) : t('costRun.stillRunning'),
    },
    { label: t('costRun.fact.baseline'), value: formatDateTime(run.baselineSnapshotAt, locale) },
    {
      label: t('costRun.fact.final'),
      value: run.finalSnapshotAt ? formatDateTime(run.finalSnapshotAt, locale) : '—',
    },
    { label: t('costRun.fact.commit'), value: run.gitSha ?? '—' },
    {
      // A run with no declared scope covered every service, which is a wider
      // claim than "none" — the two must not render the same way.
      label: t('costRun.fact.scope'),
      value: run.services == null ? t('costRun.scopeAll') : run.services.join(', ') || '—',
    },
  ]

  return (
    <>
      <div className={styles.facts}>
        {rows.map((row) => (
          <div key={row.label} className={styles.factRow}>
            <span className={styles.factLabel}>{row.label}</span>
            <span className={styles.factValue}>{row.value}</span>
          </div>
        ))}
      </div>
      {run.budget ? (
        <p className={styles.note}>
          <InfoIcon size={14} />
          <span>
            {t('costRun.budgetDeclared')}
            <span className={styles.idList}>
              {Object.entries(run.budget).map(([key, value]) => (
                <span key={key} className={styles.idChip}>
                  {key}: {String(value)}
                </span>
              ))}
            </span>
          </span>
        </p>
      ) : null}
      {run.notes ? <p className={styles.muted}>{run.notes}</p> : null}
    </>
  )
}
