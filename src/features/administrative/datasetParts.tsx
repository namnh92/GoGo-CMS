import { useState, type ReactNode } from 'react'
import { useI18n, useT } from '@/shared/i18n/i18n'
import type { MessageKey } from '@/shared/i18n/vi'
import { formatDateTime, formatNumber } from '@/shared/format'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import type { AdministrativeCapability } from '@/shared/api/contracts-administrative'
import { capabilityFacts, type ActionBlock } from './datasetGuards'
import { styles } from './administrativeData.style'

/** A long opaque identity: shown abbreviated, copied in full, readable in a title. */
export function Checksum({ value, label }: { value: string; label: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const short = value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
  return (
    <span className={styles.checksumRow}>
      <code className={styles.checksum} title={value}>
        {short}
      </code>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t('administrative.copyChecksum', { label })}
        onClick={() => {
          // Best effort: a browser without clipboard permission simply does
          // nothing, and the full value is in the title either way.
          void navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => undefined)
        }}
      >
        {copied ? t('administrative.copied') : t('administrative.copy')}
      </Button>
    </span>
  )
}

export function Facts({ children }: { children: ReactNode }) {
  return <dl className={styles.facts}>{children}</dl>
}

export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{children}</dd>
    </div>
  )
}

/**
 * Why an action is not available, phrased as a failure.
 *
 * Rendered beside the disabled control rather than replacing it: a control that
 * disappears teaches an operator that the screen is broken, one that is greyed
 * out with a reason teaches them what to do next.
 */
export function BlockedReason({ block }: { block: ActionBlock | null }) {
  const t = useT()
  if (!block) return null
  return (
    <p role="status" className={styles.blocked}>
      <span aria-hidden="true">⚠</span>
      {t(block.messageKey, block.values)}
    </p>
  )
}

/**
 * The capability summary.
 *
 * Four independent facts and the identities behind them. A missing boundary
 * release is amber and says the resolver is degraded; it never says the API is
 * unavailable, because it is not — rooms, search and plans are all still served.
 */
export function CapabilityPanel({ capability }: { capability: AdministrativeCapability }) {
  const t = useT()
  const { locale } = useI18n()
  const facts = capabilityFacts(capability)

  return (
    <div className={styles.capability}>
      <ul className={styles.capabilityGrid}>
        {facts.map((fact) => (
          <li key={fact.id} className={styles.capabilityCell}>
            <p className={styles.factLabel}>{t(fact.labelKey)}</p>
            <p className={styles.capabilityValue}>
              <Badge
                tone={fact.tone === 'mint' ? 'mint' : fact.tone === 'amber' ? 'amber' : 'danger'}
              >
                {t(fact.valueKey)}
              </Badge>
            </p>
            {fact.detailKey ? <p className={styles.capabilityHint}>{t(fact.detailKey)}</p> : null}
          </li>
        ))}
      </ul>
      <Facts>
        <Fact label={t('administrative.capability.activeVersion')}>
          <code className={styles.version}>{capability.dataset.version ?? '—'}</code>
        </Fact>
        <Fact label={t('administrative.capability.publishedAt')}>
          {formatDateTime(capability.dataset.publishedAt, locale)}
        </Fact>
        <Fact label={t('administrative.capability.boundaryVersion')}>
          <code className={styles.version}>{capability.boundaries.version ?? '—'}</code>
        </Fact>
        <Fact label={t('administrative.capability.boundaryLoadedAt')}>
          {formatDateTime(capability.boundaries.loadedAt, locale)}
        </Fact>
        <Fact label={t('administrative.capability.boundaryUnits')}>
          {t('administrative.capability.boundaryUnitsValue', {
            provinces: formatNumber(capability.boundaries.provinces, locale),
            communes: formatNumber(capability.boundaries.communes, locale),
          })}
        </Fact>
        <Fact label={t('administrative.capability.quarantined')}>
          {formatNumber(capability.dataset.quarantined, locale)}
        </Fact>
        <Fact label={t('administrative.capability.unresolved')}>
          {formatNumber(capability.dataset.unresolved, locale)}
        </Fact>
        <Fact label={t('administrative.capability.validation')}>
          {capability.dataset.validation
            ? t('administrative.errorsWarnings', {
                errors: formatNumber(capability.dataset.validation.errors, locale),
                warnings: formatNumber(capability.dataset.validation.warnings, locale),
              })
            : t('administrative.neverValidated')}
        </Fact>
        <Fact label={t('administrative.capability.observedAt')}>
          {formatDateTime(capability.observedAt, locale)}
        </Fact>
      </Facts>
      <CountRow
        title={t('administrative.capability.mappings')}
        counts={capability.mappings}
        prefix="administrative.mappingStatus"
      />
      <CountRow
        title={t('administrative.capability.remediation')}
        counts={capability.remediation}
        prefix="administrative.remediation"
      />
    </div>
  )
}

/**
 * A record of counts the server chose the keys of. An unknown key renders as
 * itself rather than being dropped — the alternative is a total that silently
 * stops adding up.
 */
function CountRow({
  title,
  counts,
  prefix,
}: {
  title: string
  counts: Record<string, number>
  prefix: string
}) {
  const t = useT()
  const { locale } = useI18n()
  const entries = Object.entries(counts)
  if (entries.length === 0) return null
  return (
    <div className={styles.countRow}>
      <p className={styles.factLabel}>{title}</p>
      <ul className={styles.countList}>
        {entries.map(([key, value]) => {
          const messageKey = `${prefix}.${key}` as MessageKey
          const label = t(messageKey)
          return (
            <li key={key} className={styles.countItem}>
              <span>{label === messageKey ? key : label}</span>
              <strong className={styles.countValue}>{formatNumber(value, locale)}</strong>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
