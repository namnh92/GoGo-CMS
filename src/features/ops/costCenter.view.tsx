import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useI18n, useLabel, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatDateTime, formatNumber, formatPercent } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader, KpiCard } from '@/shared/ui/Card'
import { Badge, StatusBadge, type Tone } from '@/shared/ui/Badge'
import { ProgressBar } from '@/shared/ui/Progress'
import { Drawer } from '@/shared/ui/Overlay'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import { InfoIcon } from '@/shared/ui/icons'
import { cn } from '@/shared/ui/cn'
import type {
  CmsCostBudgetStatus,
  CmsCostCards,
  CmsCostOverview,
  CmsCostProviderRow,
  CmsCostServiceRow,
  CmsCostTestRun,
  CmsCostWindow,
} from '@/shared/api/contracts'
import { fetchCostOverview, fetchCostService, fetchCostTestRuns } from './api'
import { formatMicros } from './costMoney'
import {
  BasisBadge,
  ConfidenceBadge,
  CostAmount,
  CostMicros,
  FreshnessBadge,
  MeterList,
  ProviderStatusBadge,
} from './costParts'
import { styles } from './costCenter.style'

const WINDOWS: CmsCostWindow[] = ['today', '7d', '30d', 'mtd']
const RUN_LIMIT = 10
/** How many ids an "unknown"/"unattributed" card names before it stops listing. */
const ID_PREVIEW = 6

/**
 * COST-CMS-009 (GoGo-BE#381) — the Cost Center.
 *
 * What the screen is for: telling an operator what GoGo spent, what it only
 * estimates, and — the part every other console gets wrong — what nothing is
 * measuring at all. Three rules are enforced in the markup rather than left
 * to a reviewer:
 *
 * 1. **Unknown renders as "—" and "chưa có nguồn chi phí", never as `$0`.**
 *    A real zero exists (`MEASURED_ZERO`) and says so in its own words.
 *    Collectors stay UNKNOWN until their credentials land (GoGo-Infra#114);
 *    that is a fact to show, not a gap to paper over.
 * 2. **Nothing branches on a provider id.** Rows come from the server's cost
 *    registry in registry order, with services nested; a provider added to
 *    `COST_REGISTRY_DATA` appears here with no change to this file. There is
 *    no `places | routes | sheets` enum anywhere in the Cost Center.
 * 3. **Estimated and actual never add up.** `spendMicros` is the reported
 *    number after §12 precedence; the per-basis columns say what it is made
 *    of, and an estimate an invoice displaced is reported separately.
 *
 * The console reads `/v1/cms/ops/costs*` and nothing else. It holds no
 * Grafana credential, sends no PromQL, and calls no paid provider: refreshing
 * this page costs nothing. Trend charts are deliberately absent — the daily
 * cost tables answer totals, not time series, and a chart drawn from four
 * window buttons would be a shape without a source.
 */
export default function CostCenterScreen() {
  const t = useT()
  const { can } = useSession()
  const [costWindow, setCostWindow] = useState<CmsCostWindow>('mtd')
  const [selected, setSelected] = useState<{ providerId: string; serviceId: string } | null>(null)

  const allowed = can('cost.read')

  const overview = useQuery({
    queryKey: queryKeys.opsCostCenter(costWindow),
    queryFn: ({ signal }) => fetchCostOverview(costWindow, signal),
    // The tables behind this are written once a day by collectors; polling
    // them would add load and tell an operator nothing new.
    staleTime: 60_000,
    enabled: allowed,
  })

  const runs = useQuery({
    queryKey: queryKeys.opsCostTestRuns(RUN_LIMIT),
    queryFn: ({ signal }) => fetchCostTestRuns(RUN_LIMIT, signal),
    staleTime: 60_000,
    enabled: allowed,
  })

  if (!allowed) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('cost.title')} />
        <PageBody>
          <PermissionDeniedState hint={t('cost.denied')} />
        </PageBody>
      </>
    )
  }

  return (
    <>
      <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('cost.title')} />
      <PageBody>
        <div className={styles.toolbar}>
          <div className={styles.windowGroup} role="group" aria-label={t('cost.window')}>
            {WINDOWS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === costWindow}
                onClick={() => setCostWindow(value)}
                className={cn(
                  styles.windowButton,
                  value === costWindow && styles.windowButtonActive,
                )}
              >
                {t(`cost.window.${value}` as 'cost.window.mtd')}
              </button>
            ))}
          </div>
          {overview.data ? <Meta data={overview.data} /> : null}
        </div>

        <AsyncBoundary
          status={overview.status}
          error={overview.error}
          data={overview.data}
          onRetry={() => void overview.refetch()}
        >
          {(data) => (
            <>
              {!data.ledgerEnabled ? (
                <div className={cn(styles.banner, styles.bannerWarn)}>
                  <InfoIcon size={16} />
                  <span>{t('cost.ledgerOff')}</span>
                </div>
              ) : null}

              <Cards cards={data.cards} />
              <BudgetCard budget={data.cards.budget} />
              <UnknownCard cards={data.cards} />

              <div className={styles.sectionList}>
                {data.providerRows.length === 0 ? (
                  <EmptyState
                    title={t('cost.providers.empty')}
                    hint={t('cost.providers.emptyHint')}
                  />
                ) : (
                  data.providerRows.map((provider) => (
                    <ProviderCard
                      key={provider.providerId}
                      provider={provider}
                      onSelectService={(serviceId) =>
                        setSelected({ providerId: provider.providerId, serviceId })
                      }
                    />
                  ))
                )}
              </div>

              <UnattributedCard unattributed={data.unattributed} />
            </>
          )}
        </AsyncBoundary>

        <Card>
          <CardHeader title={t('cost.runs.title')} hint={t('cost.runs.hint')} />
          <CardBody className="p-0">
            <AsyncBoundary
              status={runs.status}
              error={runs.error}
              data={runs.data}
              isEmpty={(data) => data.testRuns.length === 0}
              empty={<EmptyState title={t('cost.runs.empty')} hint={t('cost.runs.emptyHint')} />}
              onRetry={() => void runs.refetch()}
            >
              {(data) => <TestRunTable runs={data.testRuns} />}
            </AsyncBoundary>
          </CardBody>
        </Card>
      </PageBody>

      <ServiceDrawer
        selection={selected}
        costWindow={costWindow}
        onClose={() => setSelected(null)}
      />
    </>
  )
}

function Meta({ data }: { data: CmsCostOverview }) {
  const t = useT()
  const { locale } = useI18n()
  return (
    <p className={styles.meta}>
      <span>{t('cost.environment', { env: data.environment })}</span>
      <span>{t('cost.range', { from: data.range.from, to: data.range.to })}</span>
      <span>{t('cost.generatedAt', { at: formatDateTime(data.generatedAt, locale) })}</span>
    </p>
  )
}

/**
 * The §35 cards. They are month-shaped whatever the window is — a free cap and
 * an invoice are monthly — so the window selector moves the rows below, not
 * these. `null` here is "no cost row in scope", which is unknown, not zero.
 */
function Cards({ cards }: { cards: CmsCostCards }) {
  const t = useT()
  const { locale } = useI18n()

  const projectedReady = cards.projected.micros != null

  return (
    <div className={styles.cardGrid}>
      <KpiCard
        label={t('cost.card.today')}
        value={
          <CostAmount
            spendMicros={cards.today.spendMicros}
            currency={cards.today.currency}
            mixedCurrency={cards.today.mixedCurrency}
            costStatus={cards.today.spendMicros == null ? 'UNKNOWN' : 'KNOWN'}
          />
        }
        sub={t('cost.card.daySub', {
          day: cards.today.day,
          count: formatNumber(cards.today.services, locale),
        })}
      />
      <KpiCard
        label={t('cost.card.monthToDate')}
        value={
          <CostAmount
            spendMicros={cards.monthToDate.spendMicros}
            currency={cards.monthToDate.currency}
            mixedCurrency={cards.monthToDate.mixedCurrency}
            costStatus={cards.monthToDate.spendMicros == null ? 'UNKNOWN' : 'KNOWN'}
          />
        }
        sub={t('cost.card.monthSub', {
          month: cards.monthToDate.month,
          count: formatNumber(cards.monthToDate.services, locale),
        })}
      />
      <KpiCard
        label={t('cost.card.projected')}
        value={
          projectedReady ? (
            formatMicros(cards.projected.micros, cards.projected.currency, locale)
          ) : (
            <span className={styles.money}>—</span>
          )
        }
        sub={
          projectedReady
            ? t('cost.card.projectedSub', { month: cards.projected.month })
            : t('cost.card.projectedNeed', {
                elapsed: cards.projected.elapsedDays,
                min: cards.projected.minElapsedDays,
              })
        }
      />
      <KpiCard
        label={t('cost.card.monitoring')}
        value={
          <CostAmount
            spendMicros={cards.costOfMonitoring.spendMicros}
            currency={cards.costOfMonitoring.currency}
            mixedCurrency={cards.costOfMonitoring.mixedCurrency}
            costStatus={cards.costOfMonitoring.spendMicros == null ? 'UNKNOWN' : 'KNOWN'}
          />
        }
        sub={t('cost.card.monitoringSub', {
          count: formatNumber(cards.costOfMonitoring.serviceIds.length, locale),
        })}
      />
    </div>
  )
}

const BUDGET_TONE: Record<CmsCostBudgetStatus['state'], Tone> = {
  ok: 'mint',
  warning: 'amber',
  exceeded: 'danger',
  projected_exceed: 'amber',
}

/**
 * Budgets (epic §32/§33). A month with no budget set is not a budget of zero,
 * so the card says there is none rather than drawing an empty bar.
 */
function BudgetCard({ budget }: { budget: CmsCostCards['budget'] }) {
  const t = useT()
  const label = useLabel()
  const { locale } = useI18n()
  // `total` also appears in `budgets`; keyed by scope so it is listed once and
  // first, whichever order the server sends.
  const byScope = new Map<string, CmsCostBudgetStatus>()
  for (const row of [...(budget.total ? [budget.total] : []), ...budget.budgets]) {
    const key = `${row.scope.kind}:${row.scope.id ?? ''}`
    if (!byScope.has(key)) byScope.set(key, row)
  }
  const rows = [...byScope.values()]

  return (
    <Card>
      <CardHeader title={t('cost.card.budget')} hint={t('cost.budget.hint')} />
      <CardBody>
        {rows.length === 0 ? (
          <p className={styles.cardSub}>{t('cost.budget.none')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {rows.map((row) => (
              <div key={`${row.scope.kind}:${row.scope.id ?? 'total'}`}>
                <div className={styles.providerHead}>
                  <span className={styles.serviceName}>
                    {row.scope.id ?? t('cost.budget.scope.TOTAL')}
                  </span>
                  <StatusBadge
                    tone={BUDGET_TONE[row.state]}
                    shape={row.state === 'ok' ? 'check' : 'alert'}
                    label={label(`cost.budget.state.${row.state}`, row.state)}
                  />
                </div>
                <ProgressBar
                  className="mt-1 w-full"
                  value={row.usedMicros}
                  max={row.monthMicros}
                  tone={BUDGET_TONE[row.state]}
                  label={t('cost.budget.bar', {
                    scope: row.scope.id ?? t('cost.budget.scope.TOTAL'),
                  })}
                  caption={t('cost.budget.used', {
                    used: formatMicros(row.usedMicros, row.currency, locale),
                    total: formatMicros(row.monthMicros, row.currency, locale),
                    pct: formatPercent(row.usedPct, locale, { alreadyPercent: true }),
                  })}
                />
                <p className={styles.cardSub}>
                  {row.projectedMicros == null
                    ? t('cost.budget.noProjection')
                    : t('cost.budget.projection', {
                        amount: formatMicros(row.projectedMicros, row.currency, locale),
                        pct: formatPercent(row.projectedPct, locale, { alreadyPercent: true }),
                      })}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

/** What the console cannot cost yet — the card the epic exists for. */
function UnknownCard({ cards }: { cards: CmsCostCards }) {
  const t = useT()
  const { locale } = useI18n()
  const { providerIds, serviceIds } = cards.unknown
  const total = providerIds.length + serviceIds.length

  return (
    <Card>
      <CardHeader
        title={t('cost.unknown.title')}
        hint={t('cost.unknown.hint')}
        actions={
          <Badge tone={total > 0 ? 'amber' : 'mint'} icon={<InfoIcon size={11} />}>
            {formatNumber(total, locale)}
          </Badge>
        }
      />
      <CardBody>
        {total === 0 ? (
          <p className={styles.cardSub}>{t('cost.unknown.none')}</p>
        ) : (
          <>
            <p className={styles.cardSub}>
              {t('cost.unknown.counts', {
                providers: formatNumber(providerIds.length, locale),
                services: formatNumber(serviceIds.length, locale),
              })}
            </p>
            <IdList ids={[...providerIds, ...serviceIds]} />
          </>
        )}
      </CardBody>
    </Card>
  )
}

/**
 * Ids in the tables the registry does not know. Money there is reported
 * nowhere else, so it is named rather than quietly dropped.
 */
function UnattributedCard({ unattributed }: { unattributed: CmsCostOverview['unattributed'] }) {
  const t = useT()
  const ids = [...unattributed.providerIds, ...unattributed.serviceIds]
  if (ids.length === 0) return null
  return (
    <Card>
      <CardHeader title={t('cost.unattributed.title')} hint={t('cost.unattributed.hint')} />
      <CardBody>
        <IdList ids={ids} />
      </CardBody>
    </Card>
  )
}

function IdList({ ids }: { ids: string[] }) {
  const t = useT()
  const { locale } = useI18n()
  const shown = ids.slice(0, ID_PREVIEW)
  const rest = ids.length - shown.length
  return (
    <p className={styles.unknownList}>
      {shown.map((id) => (
        <span key={id} className={styles.idChip}>
          {id}
        </span>
      ))}
      {rest > 0 ? (
        <span className={styles.cardSub}>
          {t('cost.idsMore', { count: formatNumber(rest, locale) })}
        </span>
      ) : null}
    </p>
  )
}

/**
 * One registry provider with its services. Order is the server's, and the
 * heading is `displayName` from the registry — no id is translated here,
 * because a provider this file has never heard of must still render.
 */
function ProviderCard({
  provider,
  onSelectService,
}: {
  provider: CmsCostProviderRow
  onSelectService: (serviceId: string) => void
}) {
  const t = useT()
  const { locale } = useI18n()

  return (
    <Card>
      <CardHeader
        title={
          <span className={styles.providerHead}>
            <span className={styles.providerName}>{provider.displayName}</span>
            <ProviderStatusBadge status={provider.status} />
            <FreshnessBadge status={provider.freshness.status} />
          </span>
        }
        hint={
          <span className={styles.providerFacts}>
            <span className={styles.serviceId}>{provider.providerId}</span>
            <span>
              {t('cost.provider.updated', {
                at: provider.lastUpdated ? formatDateTime(provider.lastUpdated, locale) : '—',
              })}
            </span>
            {provider.billingTimezone ? (
              <span>{t('cost.provider.timezone', { tz: provider.billingTimezone })}</span>
            ) : null}
          </span>
        }
        actions={
          <CostAmount
            spendMicros={provider.spendMicros}
            currency={provider.currency}
            mixedCurrency={provider.mixedCurrency}
            costStatus={provider.costStatus}
            className="text-right"
          />
        }
      />
      <CardBody className="p-0">
        {provider.services.length === 0 ? (
          <p className="px-5 py-4 text-xs text-text-subtle">{t('cost.provider.noServices')}</p>
        ) : (
          <div className={styles.scroller}>
            <table className={styles.table}>
              <caption className="sr-only">
                {t('cost.provider.caption', { provider: provider.displayName })}
              </caption>
              <thead>
                <tr>
                  <th className={styles.th}>{t('cost.col.service')}</th>
                  <th className={styles.th}>{t('cost.col.usage')}</th>
                  <th className={styles.thNum}>{t('cost.col.spend')}</th>
                  <th className={styles.thNum}>{t('cost.col.estimated')}</th>
                  <th className={styles.thNum}>{t('cost.col.actual')}</th>
                  <th className={styles.th}>{t('cost.col.basis')}</th>
                  <th className={styles.th}>{t('cost.col.confidence')}</th>
                  <th className={styles.th}>{t('cost.col.freshness')}</th>
                  <th className={styles.th}>{t('cost.col.updated')}</th>
                </tr>
              </thead>
              <tbody>
                {provider.services.map((service) => (
                  <ServiceRow
                    key={service.serviceId}
                    service={service}
                    onSelect={() => onSelectService(service.serviceId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function ServiceRow({ service, onSelect }: { service: CmsCostServiceRow; onSelect: () => void }) {
  const t = useT()
  const { locale } = useI18n()
  return (
    <tr>
      <td className={styles.td}>
        <button type="button" className={styles.rowButton} onClick={onSelect}>
          <span className={`block ${styles.serviceName}`}>{service.displayName}</span>
          <span className={`block ${styles.serviceId}`}>{service.serviceId}</span>
          <span className="sr-only">{t('cost.service.open')}</span>
        </button>
      </td>
      <td className={styles.td}>
        <MeterList meters={service.usage} instrumented={service.instrumented} />
      </td>
      <td className={styles.tdNum}>
        <CostAmount
          spendMicros={service.spendMicros}
          currency={service.currency}
          mixedCurrency={service.mixedCurrency}
          costStatus={service.costStatus}
        />
      </td>
      <td className={styles.tdNum}>
        <CostMicros micros={service.estimatedMicros} currency={service.currency} />
      </td>
      <td className={styles.tdNum}>
        <CostMicros micros={service.actualMicros} currency={service.currency} />
      </td>
      <td className={styles.td}>
        <BasisBadge basis={service.basis} />
      </td>
      <td className={styles.td}>
        <ConfidenceBadge confidence={service.confidence} />
      </td>
      <td className={styles.td}>
        <FreshnessBadge status={service.freshness.status} />
      </td>
      <td className={styles.td}>
        <span className={styles.muted}>
          {service.lastUpdated ? formatDateTime(service.lastUpdated, locale) : '—'}
        </span>
      </td>
    </tr>
  )
}

/**
 * Per-service drill-down: where the money came from, which sources cover it
 * and how stale they are, and every operation with its meters — including a
 * label the registry does not know (`unregistered`), so a billed call never
 * vanishes because somebody forgot to fold a SKU.
 */
function ServiceDrawer({
  selection,
  costWindow,
  onClose,
}: {
  selection: { providerId: string; serviceId: string } | null
  costWindow: CmsCostWindow
  onClose: () => void
}) {
  const t = useT()
  const { locale } = useI18n()

  const detail = useQuery({
    queryKey: queryKeys.opsCostService(
      selection?.providerId ?? '',
      selection?.serviceId ?? '',
      costWindow,
    ),
    queryFn: ({ signal }) =>
      fetchCostService(selection!.providerId, selection!.serviceId, costWindow, signal),
    enabled: selection != null,
  })

  return (
    <Drawer
      open={selection != null}
      onClose={onClose}
      title={selection?.serviceId ?? ''}
      description={t('cost.service.hint')}
      width="lg"
    >
      <AsyncBoundary
        status={detail.status}
        error={detail.error}
        data={detail.data}
        onRetry={() => void detail.refetch()}
      >
        {({ service }) => (
          <div className={styles.drawerBlock}>
            <div>
              <p className={styles.drawerLabel}>{t('cost.service.breakdown')}</p>
              <div className={styles.drawerRow}>
                <span>{t('cost.col.spend')}</span>
                <CostAmount
                  spendMicros={service.spendMicros}
                  currency={service.currency}
                  mixedCurrency={service.mixedCurrency}
                  costStatus={service.costStatus}
                />
              </div>
              <div className={styles.drawerRow}>
                <span>{t('cost.col.estimated')}</span>
                <CostMicros micros={service.estimatedMicros} currency={service.currency} />
              </div>
              <div className={styles.drawerRow}>
                <span>{t('cost.col.actual')}</span>
                <CostMicros micros={service.actualMicros} currency={service.currency} />
              </div>
              <div className={styles.drawerRow}>
                <span>{t('cost.service.fixed')}</span>
                <CostMicros micros={service.fixedMicros} currency={service.currency} />
              </div>
              <div className={styles.drawerRow}>
                <span>{t('cost.service.manual')}</span>
                <CostMicros micros={service.manualMicros} currency={service.currency} />
              </div>
              {service.shadowedEstimatedMicros > 0 ? (
                <p className={styles.note}>
                  <InfoIcon size={14} />
                  {t('cost.service.shadowed', {
                    amount: formatMicros(service.shadowedEstimatedMicros, service.currency, locale),
                  })}
                </p>
              ) : null}
            </div>

            <div>
              <p className={styles.drawerLabel}>{t('cost.service.sources')}</p>
              {service.freshness.sources.length === 0 ? (
                <p className={styles.cardSub}>{t('cost.service.noSources')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {service.freshness.sources.map((source) => (
                    <div
                      key={`${source.sourceId}:${source.serviceId ?? ''}`}
                      className={styles.sourceRow}
                    >
                      <div className={styles.sourceHead}>
                        <span className={styles.sourceId}>{source.sourceId}</span>
                        <FreshnessBadge status={source.status} />
                      </div>
                      <p className={styles.cardSub}>
                        {t('cost.service.sourceFacts', {
                          success: source.lastSuccessfulAt
                            ? formatDateTime(source.lastSuccessfulAt, locale)
                            : '—',
                          asOf: source.sourceAsOf ? formatDateTime(source.sourceAsOf, locale) : '—',
                          failures: formatNumber(source.consecutiveFailures, locale),
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className={styles.drawerLabel}>{t('cost.service.operations')}</p>
              {service.operations.length === 0 ? (
                <p className={styles.cardSub}>{t('cost.service.noOperations')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {service.operations.map((operation) => (
                    <div key={operation.operationId} className={styles.operation}>
                      <div className={styles.operationHead}>
                        <span className={styles.sourceId}>
                          {operation.displayName ?? operation.operationId}
                        </span>
                        {operation.unregistered ? (
                          <StatusBadge
                            tone="amber"
                            shape="alert"
                            label={t('cost.service.unregistered')}
                          />
                        ) : null}
                      </div>
                      <MeterList
                        meters={operation.meters}
                        instrumented={operation.instrumented}
                        limit={20}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </AsyncBoundary>
    </Drawer>
  )
}

const RUN_TONE: Record<string, Tone> = {
  running: 'lavender',
  ok: 'mint',
  over_budget: 'amber',
  failed: 'danger',
}

/**
 * Test runs (epic §28). A run still `running` has no total: its deltas are
 * the baseline snapshot, and a floor of 0 would read as a result.
 */
function TestRunTable({ runs }: { runs: CmsCostTestRun[] }) {
  const t = useT()
  const label = useLabel()
  const { locale } = useI18n()

  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <caption className="sr-only">{t('cost.runs.title')}</caption>
        <thead>
          <tr>
            <th className={styles.th}>{t('cost.runs.col.name')}</th>
            <th className={styles.th}>{t('cost.runs.col.status')}</th>
            <th className={styles.th}>{t('cost.runs.col.started')}</th>
            <th className={styles.th}>{t('cost.runs.col.environment')}</th>
            <th className={styles.th}>{t('cost.runs.col.commit')}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td className={styles.td}>
                <Link className={styles.runLink} to={`/costs/test-runs/${run.id}`}>
                  {run.name}
                </Link>
              </td>
              <td className={styles.td}>
                <StatusBadge
                  tone={RUN_TONE[run.status] ?? 'neutral'}
                  shape={
                    run.status === 'ok' ? 'check' : run.status === 'running' ? 'clock' : 'alert'
                  }
                  label={label(`cost.runStatus.${run.status}`, run.status)}
                />
              </td>
              <td className={styles.td}>
                <span className={styles.muted}>{formatDateTime(run.startedAt, locale)}</span>
              </td>
              <td className={styles.td}>
                <span className={styles.muted}>{run.environment}</span>
              </td>
              <td className={styles.td}>
                <span className={styles.serviceId}>{run.gitSha ?? '—'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
