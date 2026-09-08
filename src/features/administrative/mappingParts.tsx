import { useI18n, useT } from '@/shared/i18n/i18n'
import type { MessageKey } from '@/shared/i18n/vi'
import { formatNumber } from '@/shared/format'
import { Badge, StatusBadge, type BadgeShape, type Tone } from '@/shared/ui/Badge'
import type {
  AdministrativeApprovalBlockCode,
  AdministrativeMappingStatus,
  AdministrativeStaleVerdict,
} from '@/shared/api/contracts-administrative'
import { AdministrativeUnitCombobox } from './unitCombobox'
import { styles } from './mapping.style'

/**
 * CMS #156 — the vocabulary of per-place mapping moderation.
 *
 * This screen certifies where one place is. It is not the source-drift queue
 * (#155), which adjudicates the dataset itself, and it is not catalogue
 * publication, which belongs to the editor. Keeping those three legible is most
 * of the design: a moderator who thinks "verified" means "published", or an
 * editor who thinks a rejected *mapping* is a rejected *place*, will make the
 * wrong decision confidently.
 */

const STATUS_TONE: Record<AdministrativeMappingStatus, Tone> = {
  UNMAPPED: 'neutral',
  AUTO_MATCHED: 'lavender',
  NEEDS_REVIEW: 'amber',
  VERIFIED: 'mint',
  REJECTED: 'danger',
  STALE: 'amber',
}

const STATUS_SHAPE: Record<AdministrativeMappingStatus, BadgeShape> = {
  UNMAPPED: 'dot',
  AUTO_MATCHED: 'info',
  NEEDS_REVIEW: 'alert',
  VERIFIED: 'check',
  REJECTED: 'alert',
  STALE: 'clock',
}

export function MappingStatusBadge({ status }: { status: AdministrativeMappingStatus }) {
  const t = useT()
  return (
    <StatusBadge
      tone={STATUS_TONE[status]}
      shape={STATUS_SHAPE[status]}
      label={t(`mapping.status.${status}` as const)}
    />
  )
}

/**
 * Why the editor cannot publish this place yet.
 *
 * Deliberately a different shape and wording from the mapping status beside it:
 * one says what the mapping *is*, this says what it *stops*.
 */
export function ApprovalBlockBadge({
  block,
}: {
  block: { code: AdministrativeApprovalBlockCode; message: string } | null
}) {
  const t = useT()
  if (!block) {
    return <Badge tone="mint">{t('mapping.approval.clear')}</Badge>
  }
  return (
    <span className={styles.blockRow}>
      <Badge tone="danger">{t('mapping.approval.blocked')}</Badge>
      <span className={styles.meta}>{t(`mapping.block.${block.code}` as const)}</span>
    </span>
  )
}

/**
 * The staleness verdict, which is the easiest thing on this screen to read
 * wrongly.
 *
 * `REVALIDATED` means the mapping carries an older dataset version and is still
 * true — healthy, and not stale. A screen that showed "older version" as a
 * warning would send reviewers to re-verify thousands of correct rows.
 */
export function StalenessBadge({ verdict }: { verdict: AdministrativeStaleVerdict }) {
  const t = useT()
  return (
    <span className={styles.blockRow}>
      <Badge tone={verdict.stale ? 'amber' : 'mint'}>
        {t(verdict.stale ? 'mapping.stale.yes' : 'mapping.stale.no')}
      </Badge>
      <span className={styles.meta}>{t(`mapping.staleReason.${verdict.reason}` as const)}</span>
    </span>
  )
}

/** 1.00 or nothing. A person's judgement is not a probability. */
export function Confidence({ value }: { value: string | null }) {
  const t = useT()
  const { locale } = useI18n()
  if (value === null) {
    // Never a bar, never a zero: an unscored mapping is not a low-confidence one.
    return <span className={styles.meta}>{t('mapping.confidence.unscored')}</span>
  }
  return (
    <Badge tone="mint">
      {t('mapping.confidence.value', { value: formatNumber(Number(value), locale) })}
    </Badge>
  )
}

export function RemediationCounts({ counts }: { counts: Record<string, number> }) {
  const t = useT()
  const { locale } = useI18n()
  const entries = Object.entries(counts)
  if (entries.length === 0) return <p className={styles.meta}>{t('mapping.remediation.empty')}</p>
  return (
    <ul className={styles.countList}>
      {entries.map(([key, value]) => {
        const messageKey = `mapping.remediation.${key}` as MessageKey
        const label = t(messageKey)
        return (
          <li key={key} className={styles.countItem}>
            <span>{label === messageKey ? key : label}</span>
            <strong className={styles.countValue}>{formatNumber(value, locale)}</strong>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Province and commune, from GoGo-BE's own current dataset.
 *
 * Two rules the component exists to hold. The commune list is fetched *for the
 * chosen province*, so a commune from another province cannot be submitted at
 * all; and changing the province clears the commune, because the previous one
 * is no longer in the list the reviewer is choosing from. Display text is never
 * the identifier — the code the API returned is what gets sent.
 *
 * ADM-105 — the two `<select>`s became the shared `AdministrativeUnitCombobox`.
 * The commune list was arriving empty here, and not because a province had no
 * communes: the fetch asked for `limit=500` against an API whose maximum is
 * 200, DEV answered 400, and a `<select>` has nowhere to say so. The picker
 * that replaces it pages the whole list, searches on the server, and has a
 * visible error state.
 */
export function UnitSelector({
  provinceCode,
  communeCode,
  onProvince,
  onCommune,
  disabled,
}: {
  provinceCode: string | null
  communeCode: string | null
  onProvince: (code: string | null) => void
  onCommune: (code: string | null) => void
  disabled?: boolean
}) {
  const t = useT()

  return (
    <div className={styles.selectors}>
      <AdministrativeUnitCombobox
        level="PROVINCE"
        label={t('mapping.selector.province')}
        hint={t('mapping.selector.provinceHint')}
        value={provinceCode}
        disabled={disabled}
        onChange={(next) => {
          onProvince(next)
          // The commune belonged to the old province's list; keeping it would
          // submit a pair the hierarchy does not hold.
          onCommune(null)
        }}
      />

      <AdministrativeUnitCombobox
        level="COMMUNE"
        provinceCode={provinceCode}
        label={t('mapping.selector.commune')}
        hint={provinceCode ? t('mapping.selector.communeHint') : undefined}
        value={communeCode}
        disabled={disabled}
        onChange={onCommune}
      />
    </div>
  )
}
