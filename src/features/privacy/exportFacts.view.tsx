import { useI18n, useLabel, useT } from '@/shared/i18n/i18n'
import { formatDateTime } from '@/shared/format'
import { Badge, type Tone } from '@/shared/ui/Badge'
import type { PrivacyExportAdminStatus } from '@/shared/api/contracts'
import { styles } from './exportFacts.style'

const TONE: Record<PrivacyExportAdminStatus['status'], Tone> = {
  pending: 'lavender',
  generating: 'lavender',
  ready: 'mint',
  consumed: 'mint',
  expired: 'neutral',
  revoked: 'amber',
  failed: 'danger',
}

/**
 * GoGo-BE#256 / ADR-0032 — the state of one secure export, from the facts the
 * API returns. Never data: the console has none to show. Shared by the direct
 * user export result and the privacy-request detail, so an export reads the
 * same wherever staff meet it. A fact the server did not send is omitted.
 */
export function ExportFacts({ facts }: { facts: PrivacyExportAdminStatus }) {
  const t = useT()
  const label = useLabel()
  const { locale } = useI18n()

  const times: { key: string; title: string; at: string | null | undefined }[] = [
    { key: 'createdAt', title: t('privacy.export.createdAt'), at: facts.createdAt },
    { key: 'readyAt', title: t('privacy.export.readyAt'), at: facts.readyAt },
    { key: 'expiresAt', title: t('privacy.export.expiresAt'), at: facts.expiresAt },
    { key: 'consumedAt', title: t('privacy.export.consumedAt'), at: facts.consumedAt },
    {
      key: 'transferCompletedAt',
      title: t('privacy.export.transferCompletedAt'),
      at: facts.transferCompletedAt,
    },
    { key: 'cleanedAt', title: t('privacy.export.cleanedAt'), at: facts.cleanedAt },
  ]

  return (
    <section className={styles.box} aria-label={t('privacy.export.title')}>
      <div className={styles.header}>
        <span className={styles.title}>{t('privacy.export.title')}</span>
        <Badge tone={TONE[facts.status]}>
          {t(`privacy.export.status.${facts.status}` as const)}
        </Badge>
      </div>
      <dl className={styles.grid}>
        <div>
          <dt className={styles.label}>{t('privacy.export.initiatedBy')}</dt>
          <dd className={styles.value}>
            {t(`privacy.export.initiatedBy.${facts.initiatedBy}` as const)}
          </dd>
        </div>
        {times
          .filter((row) => row.at)
          .map((row) => (
            <div key={row.key}>
              <dt className={styles.label}>{row.title}</dt>
              <dd className={styles.value}>{formatDateTime(row.at, locale)}</dd>
            </div>
          ))}
        {facts.transferOutcome ? (
          <div>
            <dt className={styles.label}>{t('privacy.export.transferOutcome')}</dt>
            <dd className={styles.value}>
              {label(
                `privacy.export.transferOutcome.${facts.transferOutcome}`,
                facts.transferOutcome,
              )}
            </dd>
          </div>
        ) : null}
        {facts.failureCode ? (
          <div>
            <dt className={styles.label}>{t('privacy.export.failureCode')}</dt>
            <dd className={styles.code}>{facts.failureCode}</dd>
          </div>
        ) : null}
        {facts.revokeReason ? (
          <div>
            <dt className={styles.label}>{t('privacy.export.revokeReason')}</dt>
            <dd className={styles.value}>
              {label(`privacy.export.revokeReason.${facts.revokeReason}`, facts.revokeReason)}
            </dd>
          </div>
        ) : null}
      </dl>
      <p className={styles.note}>{t('privacy.export.staffNote')}</p>
    </section>
  )
}
