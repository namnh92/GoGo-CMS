import type { ReactNode } from 'react'
import { useI18n, useT } from '@/shared/i18n/i18n'
import type { MessageKey } from '@/shared/i18n/vi'
import { formatDate, formatNumber } from '@/shared/format'
import { Badge, StatusBadge, type Tone } from '@/shared/ui/Badge'
import {
  isKnownDecisionState,
  type AdministrativeDecisionState,
  type AdministrativeQuarantineCounts,
  type AdministrativeUnitIdentity,
  type KnownAdministrativeDecisionState,
} from '@/shared/api/contracts-administrative'
import { styles } from './sourceDrift.style'

/**
 * CMS #155 — the vocabulary of the source-drift queue.
 *
 * Seven different things are in play on this screen and none of them is the
 * others: what the *upstream* classified a row as, whether it is still in the
 * backlog, what a reviewer has decided in the *draft*, what the override set's
 * lifecycle is, which derived dataset it produced, which dataset is *published*,
 * and — outside this screen entirely — what a place's own mapping says.
 *
 * So each gets its own badge with its own label. One pill reading "rejected"
 * could mean the upstream row was invalid, or a reviewer refused the mapping,
 * or a place was taken down; collapsing them would make the screen unreadable
 * exactly where it matters.
 */

const DECISION_TONE: Record<KnownAdministrativeDecisionState, Tone> = {
  UNDECIDED: 'neutral',
  ACCEPTED_DRAFT: 'lavender',
  REJECTED_DRAFT: 'amber',
  SUPERSEDED: 'neutral',
  /*
   * Mint here and only here: a materialised decision is the one that actually
   * changed the dataset version. A rejection carried forward changed nothing
   * but provenance, so it stays neutral.
   */
  MATERIALIZED_ACCEPT: 'mint',
  MATERIALIZED_REJECT: 'neutral',
}

/**
 * Lavender, not mint. Mint would read as "done"; an accepted draft has changed
 * nothing yet, and the whole screen depends on that being obvious.
 */
export function DecisionStateBadge({ state }: { state: AdministrativeDecisionState }) {
  const t = useT()
  // The set is extensible: a state this build does not know is shown as itself,
  // plainly, rather than crashing the row or pretending it is undecided.
  if (!isKnownDecisionState(state)) return <StatusBadge tone="neutral" shape="dot" label={state} />
  return (
    <StatusBadge
      tone={DECISION_TONE[state]}
      shape={
        state === 'UNDECIDED'
          ? 'dot'
          : state === 'SUPERSEDED'
            ? 'clock'
            : state === 'MATERIALIZED_ACCEPT' || state === 'MATERIALIZED_REJECT'
              ? 'check'
              : 'info'
      }
      label={t(`sourceDrift.decisionState.${state}` as const)}
    />
  )
}

/** What the importer said about the row, before anybody looked at it. */
export function ClassificationBadge({ value }: { value: string }) {
  const t = useT()
  const key = `sourceDrift.classification.${value}` as MessageKey
  const label = t(key)
  return (
    <Badge tone={value === 'DIVIDED_REQUIRES_REVIEW' ? 'amber' : 'neutral'}>
      {label === key ? value : label}
    </Badge>
  )
}

export function OverrideSetBadge({ status }: { status: string }) {
  const t = useT()
  const key = `sourceDrift.setStatus.${status}` as MessageKey
  const label = t(key)
  return (
    <StatusBadge
      tone={status === 'DRAFT' ? 'lavender' : status === 'MATERIALIZED' ? 'mint' : 'neutral'}
      shape={status === 'MATERIALIZED' ? 'check' : status === 'DRAFT' ? 'info' : 'clock'}
      label={label === key ? status : label}
    />
  )
}

/**
 * A unit as an identity, never as a bare code.
 *
 * 2,212 of the 3,321 current commune codes named a different unit before
 * 2025-07-01, so the effective period is part of the answer rather than
 * decoration — and the parent is what a reviewer checks the hierarchy against.
 */
export function Identity({ unit }: { unit: AdministrativeUnitIdentity }) {
  const t = useT()
  const { locale } = useI18n()
  if (!unit.code && !unit.name) return <span className={styles.meta}>—</span>
  const meta = [
    unit.unitType,
    unit.effectiveFrom ? formatDate(unit.effectiveFrom, locale) : null,
    unit.parentCode ? t('sourceDrift.parent', { code: unit.parentCode }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <span className={styles.identity}>
      {unit.code ?? '—'}
      {unit.name ? <span className={styles.identityName}>{unit.name}</span> : null}
      {/*
        Omitted rather than placeholdered when the row carries no period or
        parent — an em dash where an effective date belongs reads as "no
        effective date", which for an administrative unit is a claim.
      */}
      {meta ? <span className={styles.identityMeta}>{meta}</span> : null}
    </span>
  )
}

export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{children}</dd>
    </div>
  )
}

export function Facts({ children }: { children: ReactNode }) {
  return <dl className={styles.facts}>{children}</dl>
}

/**
 * The three count groups, side by side and never summed together.
 *
 * `canonical` counts every edge the dataset asserts — 9,569 on the pinned
 * source. `backlog` counts the quarantine rows — 1,033. A queue that added them
 * would report a review backlog nine times too large, which is the specific
 * mistake available here.
 */
export function CountGroups({ counts }: { counts: AdministrativeQuarantineCounts }) {
  const t = useT()
  return (
    <div className={styles.countGroups}>
      <CountCard
        title={t('sourceDrift.counts.canonical')}
        hint={t('sourceDrift.counts.canonicalHint')}
        counts={counts.canonical}
        prefix="sourceDrift.changeType"
      />
      <CountCard
        title={t('sourceDrift.counts.backlog')}
        hint={t('sourceDrift.counts.backlogHint')}
        counts={counts.backlog}
        prefix="sourceDrift.classification"
        empty={t('sourceDrift.counts.backlogEmpty')}
      />
      <CountCard
        title={t('sourceDrift.counts.decisions')}
        hint={t('sourceDrift.counts.decisionsHint')}
        counts={counts.decisions}
        prefix="sourceDrift.decisionState"
      />
    </div>
  )
}

function CountCard({
  title,
  hint,
  counts,
  prefix,
  empty,
}: {
  title: string
  hint: string
  counts: Record<string, number>
  prefix: string
  empty?: string
}) {
  const t = useT()
  const { locale } = useI18n()
  const entries = Object.entries(counts)
  return (
    <section className={styles.countCard}>
      <p className={styles.countTitle}>{title}</p>
      <p className={styles.countHint}>{hint}</p>
      {entries.length === 0 ? (
        // Zero backlog is a fact worth stating; a blank card reads as a
        // failed load.
        <p className={styles.countHint}>{empty ?? '—'}</p>
      ) : (
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
      )}
    </section>
  )
}
