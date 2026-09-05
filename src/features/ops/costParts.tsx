import { useI18n, useLabel, useT } from '@/shared/i18n/i18n'
import { formatNumber } from '@/shared/format'
import { Badge, StatusBadge, type BadgeShape, type Tone } from '@/shared/ui/Badge'
import type {
  CmsCostBasis,
  CmsCostConfidence,
  CmsCostDataFreshness,
  CmsCostFreshnessStatus,
  CmsCostProviderStatus,
  CmsCostSourceKind,
  CmsCostUsageLine,
  CmsRuntimeCoverage,
} from '@/shared/api/contracts'
import { formatMicros } from './costMoney'
import { styles } from './costCenter.style'

/**
 * The pieces both cost screens render, so the honesty rules live in one place
 * rather than being restated per table.
 *
 * The rule the whole Cost Center turns on: **an amount nobody measured is not
 * a zero.** `UNKNOWN` renders a dash and says "chưa có nguồn chi phí";
 * `MEASURED_ZERO` renders an actual 0 and says somebody counted. Rendering
 * either as the other is the defect this screen exists to avoid.
 */

/** Money as the API states it — `costStatus` decides what may be shown. */
export function CostAmount({
  spendMicros,
  currency,
  mixedCurrency,
  costStatus,
  className,
}: {
  spendMicros: number | null
  currency: string | null
  mixedCurrency: boolean
  costStatus: 'KNOWN' | 'MEASURED_ZERO' | 'UNKNOWN'
  className?: string
}) {
  const t = useT()
  const { locale } = useI18n()

  // More than one billing currency in scope: the figures are real but their
  // sum is not, so no number is offered at all.
  if (mixedCurrency) {
    return <span className={styles.unknownCell}>{t('cost.mixedCurrency')}</span>
  }
  if (costStatus === 'UNKNOWN' || spendMicros == null) {
    return (
      <span className={className}>
        <span className={styles.money}>—</span>
        <span className={`block ${styles.unknownCell}`}>{t('cost.noSource')}</span>
      </span>
    )
  }
  return (
    <span className={className}>
      <span className={styles.money}>{formatMicros(spendMicros, currency, locale)}</span>
      {costStatus === 'MEASURED_ZERO' ? (
        <span className={`block ${styles.unknownCell}`}>{t('cost.measuredZero')}</span>
      ) : null}
    </span>
  )
}

/**
 * A per-basis figure beside the reported one. Null here is "no row of this
 * basis", which is a narrower claim than the row-level unknown — so it is a
 * plain dash with no "no source" sentence attached.
 */
export function CostMicros({
  micros,
  currency,
}: {
  micros: number | null
  currency: string | null
}) {
  const { locale } = useI18n()
  if (micros == null) return <span className={styles.unknownCell}>—</span>
  return <span className={styles.money}>{formatMicros(micros, currency, locale)}</span>
}

const BASIS_TONE: Record<CmsCostBasis, { tone: Tone; shape: BadgeShape }> = {
  // An invoice is the only thing that gets the confident tone.
  ACTUAL: { tone: 'mint', shape: 'check' },
  ESTIMATED: { tone: 'lavender', shape: 'info' },
  FIXED: { tone: 'neutral', shape: 'dot' },
  MANUAL: { tone: 'neutral', shape: 'dot' },
  MIXED: { tone: 'amber', shape: 'info' },
  UNKNOWN: { tone: 'neutral', shape: 'info' },
}

export function BasisBadge({ basis }: { basis: CmsCostBasis }) {
  const label = useLabel()
  const style = BASIS_TONE[basis] ?? BASIS_TONE.UNKNOWN
  return (
    <StatusBadge
      tone={style.tone}
      shape={style.shape}
      label={label(`cost.basis.${basis}`, basis)}
    />
  )
}

const FRESHNESS_TONE: Record<CmsCostFreshnessStatus, { tone: Tone; shape: BadgeShape }> = {
  FRESH: { tone: 'mint', shape: 'check' },
  // A stale source has numbers that were true when they were taken — a warning,
  // not an error, and not the same thing as having none.
  STALE: { tone: 'amber', shape: 'clock' },
  UNAVAILABLE: { tone: 'danger', shape: 'alert' },
  UNKNOWN: { tone: 'neutral', shape: 'info' },
}

export function FreshnessBadge({ status }: { status: CmsCostFreshnessStatus }) {
  const label = useLabel()
  const style = FRESHNESS_TONE[status] ?? FRESHNESS_TONE.UNKNOWN
  return (
    <StatusBadge
      tone={style.tone}
      shape={style.shape}
      label={label(`cost.freshness.${status}`, status)}
    />
  )
}

const PROVIDER_STATUS_TONE: Record<CmsCostProviderStatus, Tone> = {
  active: 'mint',
  planned: 'neutral',
}

export function ProviderStatusBadge({ status }: { status: CmsCostProviderStatus }) {
  const label = useLabel()
  return (
    <StatusBadge
      tone={PROVIDER_STATUS_TONE[status] ?? 'neutral'}
      shape={status === 'active' ? 'check' : 'info'}
      label={label(`cost.providerStatus.${status}`, status)}
    />
  )
}

export function ConfidenceBadge({ confidence }: { confidence: CmsCostConfidence | null }) {
  const t = useT()
  const label = useLabel()
  if (!confidence) return <span className={styles.unknownCell}>—</span>
  return (
    <Badge tone={confidence === 'LOW' ? 'amber' : 'neutral'}>
      {label(`cost.confidence.${confidence}`, confidence)}
      <span className="sr-only"> {t('cost.col.confidence')}</span>
    </Badge>
  )
}

/**
 * Usage meters. They are never summed: `matrix_element` and `request` are
 * different things, and one number over both would be arithmetic on unlike
 * units. A service nothing instruments says so instead of showing 0.
 */
export function MeterList({
  meters,
  instrumented,
  limit = 3,
}: {
  meters: CmsCostUsageLine[]
  instrumented: boolean
  limit?: number
}) {
  const t = useT()
  const { locale } = useI18n()

  if (!instrumented) return <span className={styles.unknownCell}>{t('cost.notInstrumented')}</span>
  if (meters.length === 0) return <span className={styles.unknownCell}>—</span>

  const shown = meters.slice(0, limit)
  const rest = meters.length - shown.length
  return (
    <span className="block">
      {shown.map((meter) => (
        <span key={`${meter.operationId ?? ''}:${meter.usageMetricId}`} className="block">
          <span className={styles.meterLine}>
            {formatNumber(meter.quantity, locale)} {meter.unit}
          </span>
          {!meter.billable ? (
            <span className={styles.unknownCell}> · {t('cost.meter.nonBillable')}</span>
          ) : null}
        </span>
      ))}
      {rest > 0 ? (
        <span className={styles.unknownCell}>{t('cost.meter.more', { count: rest })}</span>
      ) : null}
    </span>
  )
}

// ── ADR-0014 — the /monitoring dimensions, one badge each ───────────────────

const COVERAGE_TONE: Record<CmsRuntimeCoverage, { tone: Tone; shape: BadgeShape }> = {
  FULL: { tone: 'mint', shape: 'check' },
  PARTIAL: { tone: 'amber', shape: 'info' },
  // A runtime exists and nothing measures it: the one state worth a warning.
  NOT_INSTRUMENTED: { tone: 'amber', shape: 'alert' },
  'N/A': { tone: 'neutral', shape: 'dot' },
}

export function RuntimeCoverageBadge({ coverage }: { coverage: CmsRuntimeCoverage }) {
  const label = useLabel()
  const style = COVERAGE_TONE[coverage] ?? COVERAGE_TONE['N/A']
  return (
    <StatusBadge
      tone={style.tone}
      shape={style.shape}
      label={label(`monitoring.coverage.${coverage}`, coverage)}
    />
  )
}

const COST_SOURCE_TONE: Record<CmsCostSourceKind, { tone: Tone; shape: BadgeShape }> = {
  AUTO: { tone: 'lavender', shape: 'check' },
  MANUAL: { tone: 'lavender', shape: 'dot' },
  NONE: { tone: 'neutral', shape: 'dot' },
}

export function CostSourceKindBadge({ kind }: { kind: CmsCostSourceKind }) {
  const label = useLabel()
  const style = COST_SOURCE_TONE[kind] ?? COST_SOURCE_TONE.NONE
  return (
    <StatusBadge
      tone={style.tone}
      shape={style.shape}
      label={label(`monitoring.costSource.${kind}`, kind)}
    />
  )
}

const COST_DATA_TONE: Record<CmsCostDataFreshness, { tone: Tone; shape: BadgeShape }> = {
  FRESH: { tone: 'mint', shape: 'check' },
  STALE: { tone: 'amber', shape: 'clock' },
  ERROR: { tone: 'danger', shape: 'alert' },
}

/** `null` is "nothing to be current" and is said in words, never left blank. */
export function CostDataFreshnessBadge({ freshness }: { freshness: CmsCostDataFreshness | null }) {
  const t = useT()
  const label = useLabel()
  if (freshness === null) {
    return <StatusBadge tone="neutral" shape="dot" label={t('monitoring.costFreshness.none')} />
  }
  const style = COST_DATA_TONE[freshness] ?? COST_DATA_TONE.ERROR
  return (
    <StatusBadge
      tone={style.tone}
      shape={style.shape}
      label={label(`monitoring.costFreshness.${freshness}`, freshness)}
    />
  )
}
