import { useState } from 'react'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { formatDateTime } from '@/shared/format'
import { Drawer } from '@/shared/ui/Overlay'
import { Button } from '@/shared/ui/Button'
import { ConfidenceMeter } from '@/shared/ui/Progress'
import { EmptyState } from '@/shared/ui/State'
import { StarIcon } from '@/shared/ui/icons'
import type { ImportRow } from '@/shared/api/contracts-import'
import { RowStatusBadge } from './status'
import { styles } from './candidateDrawer.style'

/**
 * Branch picker for a `needs_confirmation` row.
 *
 * Only candidates the resolver surfaced are selectable — there is deliberately
 * no free-text provider-id field, because the API refuses anything else with
 * CANDIDATE_NOT_LISTED.
 */
export function CandidateDrawer({
  row,
  open,
  onClose,
  onConfirm,
  onSkip,
  pending,
  canDecide,
}: {
  row: ImportRow | null
  open: boolean
  onClose: () => void
  onConfirm: (googlePlaceId: string) => void
  onSkip: () => void
  pending: boolean
  canDecide: boolean
}) {
  const t = useT()
  const { locale } = useI18n()
  const [picked, setPicked] = useState<string | null>(null)

  if (!row) return null

  const facts = Object.entries(row.normalized).filter(([, value]) => value != null && value !== '')

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={t('candidate.title')}
      description={t('candidate.hint')}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" onClick={onSkip} disabled={!canDecide || pending}>
            {t('jobDetail.skipRow')}
          </Button>
          <Button
            variant="primary"
            disabled={!canDecide || !picked}
            loading={pending}
            onClick={() => picked && onConfirm(picked)}
          >
            {t('candidate.select')}
          </Button>
        </div>
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-[12px] text-text-subtle">#{row.rowNumber}</span>
        <RowStatusBadge status={row.status} />
      </div>

      <section className={styles.rowFacts}>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-subtle">
          {t('candidate.rowData')}
        </h3>
        {facts.length === 0 ? (
          <p className="text-xs text-text-subtle">{t('state.emptyHint')}</p>
        ) : (
          <dl className={styles.factGrid}>
            {facts.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className={styles.factKey}>{key}</dt>
                <dd className={styles.factValue}>{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
        {row.matchReasons.length > 0 ? (
          <div className={styles.reasons}>
            {row.matchReasons.map((reason) => (
              <span key={reason} className={styles.reason}>
                {reason}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {row.candidates.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={t('candidate.empty')} hint={null} />
        </div>
      ) : (
        <ul className={styles.list}>
          {row.candidates.map((candidate) => {
            const active = picked === candidate.googlePlaceId
            return (
              <li key={candidate.googlePlaceId}>
                <button
                  type="button"
                  aria-pressed={active}
                  disabled={!canDecide}
                  onClick={() => setPicked(candidate.googlePlaceId)}
                  className={`${styles.candidate} w-full text-left ${active ? styles.candidateActive : ''}`}
                >
                  {candidate.photoUrl ? (
                    <img src={candidate.photoUrl} alt="" className={styles.thumb} loading="lazy" />
                  ) : (
                    <span className={styles.thumbFallback} aria-hidden="true">
                      {candidate.name.charAt(0)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block ${styles.name}`}>{candidate.name}</span>
                    <span className={`block ${styles.address}`}>{candidate.address ?? '—'}</span>
                    <span className={styles.meta}>
                      {candidate.rating != null ? (
                        <span className="inline-flex items-center gap-1">
                          <StarIcon size={11} className="text-amber" />
                          {candidate.rating.toFixed(1)}
                          {candidate.ratingCount != null ? ` (${candidate.ratingCount})` : ''}
                        </span>
                      ) : null}
                      <span className="font-mono text-[10px]">{candidate.googlePlaceId}</span>
                    </span>
                  </span>
                  <span className="shrink-0">
                    <ConfidenceMeter
                      value={candidate.confidence}
                      label={t('candidate.confidence', {
                        percent: Math.round(candidate.confidence * 100),
                      })}
                    />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Provider data always ships with source + fetch time (FR-INGEST-014). */}
      <p className={styles.attribution}>
        {t('candidate.attribution', {
          time: formatDateTime(row.candidates[0]?.fetchedAt ?? null, locale),
        })}
        {row.candidates[0]?.attributions.length
          ? ` · ${row.candidates[0].attributions.join(', ')}`
          : ''}
      </p>
    </Drawer>
  )
}
